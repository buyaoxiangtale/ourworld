package app.ourworld

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.room.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

fun JSONObject.s(key:String, fallback:String="") = if (isNull(key)) fallback else optString(key,fallback)
fun JSONObject.o(key:String) = optJSONObject(key) ?: JSONObject()
fun JSONObject.a(key:String) = optJSONArray(key) ?: JSONArray()
fun JSONArray.objects() = (0 until length()).mapNotNull { optJSONObject(it) }
fun json(vararg pairs:Pair<String,Any?>) = JSONObject().apply { pairs.forEach { put(it.first,it.second ?: JSONObject.NULL) } }
fun JSONObject.localized(key:String, locale:String) = optJSONObject(key)?.s(locale) ?: s(key)
fun <T> referencedResources(rows:List<T>,refs:List<String>,id:(T)->String):List<T> =
    if(refs.isEmpty())rows else refs.mapNotNull{ref->rows.firstOrNull{id(it)==ref}}
fun sameMediaOrigin(value:String,base:String=BuildConfig.API_BASE):Boolean = runCatching {
    val api=java.net.URI(base.trimEnd('/')+"/")
    val media=api.resolve(value)
    fun port(uri:java.net.URI)=if(uri.port!=-1)uri.port else if(uri.scheme.equals("https",true))443 else 80
    media.scheme.equals(api.scheme,true) && media.host.equals(api.host,true) && port(media)==port(api)
}.getOrDefault(false)
fun nativeMediaUrl(value:String,base:String=BuildConfig.API_BASE):String = runCatching {
    val api=java.net.URI(base.trimEnd('/')+"/")
    val media=api.resolve(value)
    if(sameMediaOrigin(media.toString(),base) && Regex("^/api/v1/(seed|assets)/(avatar|city|country)/[^/]+\\.svg$").matches(media.path.orEmpty())) {
        java.net.URI(media.scheme,media.authority,media.path.dropLast(4)+".png",media.query,media.fragment).toString()
    } else media.toString()
}.getOrDefault(value)

@Entity(tableName="cache") data class CachedResource(@PrimaryKey val key:String,val value:String)
@Dao interface CacheDao {
    @Query("SELECT value FROM cache WHERE `key` = :key") suspend fun get(key:String):String?
    @Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun put(value:CachedResource)
    @Query("DELETE FROM cache") suspend fun clear()
}
@Database(entities=[CachedResource::class],version=1,exportSchema=false)
abstract class LocalCache:RoomDatabase() { abstract fun cache():CacheDao }

class SecureSession(appContext:Context) {
    private val prefs=appContext.getSharedPreferences("session",Context.MODE_PRIVATE)
    private fun key():javax.crypto.SecretKey {
        val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
        (store.getKey("ourworld.session",null) as? javax.crypto.SecretKey)?.let{return it}
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("ourworld.session",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun get(name:String):String = runCatching {
        val bytes=Base64.decode(prefs.getString(name,"") ?: "",Base64.NO_WRAP)
        Cipher.getInstance("AES/GCM/NoPadding").apply{init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))}.doFinal(bytes.copyOfRange(12,bytes.size)).toString(Charsets.UTF_8)
    }.getOrDefault("")
    fun set(name:String,value:String) {
        if(value.isEmpty()){prefs.edit().remove(name).apply();return}
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply{init(Cipher.ENCRYPT_MODE,key())}
        prefs.edit().putString(name,Base64.encodeToString(cipher.iv+cipher.doFinal(value.toByteArray()),Base64.NO_WRAP)).apply()
    }
    fun clear(){prefs.edit().clear().apply()}
}

class Api(private val appContext:Context) {
    val session=SecureSession(appContext)
    private val client=OkHttpClient.Builder().connectTimeout(20,java.util.concurrent.TimeUnit.SECONDS).readTimeout(100,java.util.concurrent.TimeUnit.SECONDS).build()
    private val refreshLock=Mutex()
    private val base=BuildConfig.API_BASE.trimEnd('/')
    var onEvent:((JSONObject)->Unit)?=null
    private var socket:WebSocket?=null
    init { require(BuildConfig.DEBUG || base.startsWith("https://")){"Release API must use HTTPS"} }
    suspend fun call(path:String,method:String="GET",body:JSONObject?=null,retry:Boolean=true):JSONObject = withContext(Dispatchers.IO) {
        val token=session.get("access")
        val req=Request.Builder().url(base+path).apply {
            if(token.isNotEmpty())header("Authorization","Bearer $token")
            if(method!="GET")method(method,(body?:JSONObject()).toString().toRequestBody("application/json".toMediaType()))
        }.build()
        client.newCall(req).execute().use { response ->
            val raw=response.body?.string().orEmpty()
            val value=runCatching{JSONObject(raw)}.getOrElse{JSONObject()}
            if(response.code==401 && retry && session.get("refresh").isNotEmpty() && !path.startsWith("/auth/")) {
                refreshLock.withLock {
                    if(session.get("access")==token) {
                        val refreshed=call("/auth/refresh","POST",json("refreshToken" to session.get("refresh")),false)
                        saveSession(refreshed)
                    }
                }
                return@withContext call(path,method,body,false)
            }
            if(!response.isSuccessful) throw IllegalStateException(value.s("message","HTTP ${response.code}"))
            value
        }
    }
    fun saveSession(value:JSONObject){session.set("access",value.s("accessToken"));if(value.s("refreshToken").isNotEmpty())session.set("refresh",value.s("refreshToken"))}
    fun connect() {
        socket?.cancel()
        if(session.get("access").isEmpty())return
        val url=base.replaceFirst("http","ws")+"/ws"
        socket=client.newWebSocket(Request.Builder().url(url).build(),object:WebSocketListener(){
            override fun onOpen(webSocket:WebSocket,response:Response){webSocket.send(json("event" to "auth","data" to json("token" to session.get("access"))).toString());onEvent?.invoke(json("event" to "connected"))}
            override fun onMessage(webSocket:WebSocket,text:String){runCatching{onEvent?.invoke(JSONObject(text))}}
            override fun onFailure(webSocket:WebSocket,t:Throwable,response:Response?){onEvent?.invoke(json("event" to "disconnected"))}
        })
    }
    fun disconnect(){socket?.cancel();socket=null}
    suspend fun upload(uri:Uri,purpose:String):JSONObject = withContext(Dispatchers.IO) {
        val type=appContext.contentResolver.getType(uri)?:"application/octet-stream"
        val bytes=appContext.contentResolver.openInputStream(uri)?.use{it.readBytes()} ?: error("Unable to read file")
        require(bytes.size<=10*1024*1024){"Maximum file size is 10 MB"}
        val body=MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("purpose",purpose).addFormDataPart("file","upload-${UUID.randomUUID()}",bytes.toRequestBody(type.toMediaType())).build()
        client.newCall(Request.Builder().url(base+"/uploads").header("Authorization","Bearer ${session.get("access")}").post(body).build()).execute().use{r -> val result=JSONObject(r.body?.string().orEmpty());if(!r.isSuccessful)error(result.s("message","Upload failed"));result}
    }
}
