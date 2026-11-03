package app.ourworld

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.Room
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

class WorldModel(app:Application):AndroidViewModel(app) {
    val api=Api(app)
    private val prefs=app.getSharedPreferences("preferences",0)
    private val cache=Room.databaseBuilder(app,LocalCache::class.java,"ourworld-cache").build().cache()
    var locale by mutableStateOf(prefs.getString("locale","zh")?:"zh")
    var tab by mutableIntStateOf(0)
    var route by mutableStateOf("")
    var error by mutableStateOf("")
    var notice by mutableStateOf("")
    var busy by mutableStateOf(false)
    var user by mutableStateOf<JSONObject?>(null)
    var places by mutableStateOf(listOf<JSONObject>())
    var favorites by mutableStateOf(setOf<String>())
    var query by mutableStateOf("")
    var searchResults by mutableStateOf(listOf<JSONObject>())
    var searchCompleted by mutableStateOf(false)
    var searching by mutableStateOf(false)
    var city by mutableStateOf<JSONObject?>(null)
    var country by mutableStateOf<JSONObject?>(null)
    var countryCities by mutableStateOf(listOf<JSONObject>())
    var people by mutableStateOf(listOf<JSONObject>())
    var personIndex by mutableIntStateOf(0)
    var peopleLoading by mutableStateOf(false)
    var peopleError by mutableStateOf("")
    var feedGeneration by mutableIntStateOf(0)
    var connectingPerson by mutableStateOf("")
    var resumeConnectId by mutableStateOf("")
    private var pendingConnect:JSONObject?=null
    private var pendingGeneration=0
    private var loadingGeneration:Int?=null
    var feedId="";var cursor:String?=null
    var exhausted by mutableStateOf(false)
    var feedCities by mutableStateOf(setOf<String>())
    var coverage by mutableStateOf("any")
    var conversations by mutableStateOf(listOf<JSONObject>())
    var conversation by mutableStateOf<JSONObject?>(null)
    var messages by mutableStateOf(listOf<JSONObject>())
    val outgoing=mutableStateMapOf<String,JSONObject>()
    var messagesLoading by mutableStateOf(false)
    var historyLoading by mutableStateOf(false)
    var hasOlderMessages by mutableStateOf(false)
    var peerReadSequence by mutableIntStateOf(0)
    var messageError by mutableStateOf("")
    private var initializedMessagesId=""
    val threadMessages:List<JSONObject> get() {
        val id=conversation?.s("id")
        val confirmed=messages.map{it.s("clientMessageId")}.toSet()
        return (messages+outgoing.values.filter{it.s("conversationId")==id && it.s("clientMessageId") !in confirmed}).sortedWith(compareBy<JSONObject>{it.optInt("sequence",Int.MAX_VALUE)}.thenBy{it.s("createdAt")})
    }
    var trips by mutableStateOf(listOf<JSONObject>())
    var profile by mutableStateOf(JSONObject())
    var draft by mutableStateOf(JSONObject())
    var layout by mutableStateOf(JSONObject())
    var job by mutableStateOf<JSONObject?>(null)
    var posts by mutableStateOf(listOf<JSONObject>())
    var newConversation by mutableStateOf(false)
    var online by mutableStateOf(false)
    var globeCommand by mutableStateOf<JSONObject?>(null)
    var savedCamera:JSONObject?=null
    var profileReturnRoute=""
    var authReturnRoute=""
    private val connecting=mutableSetOf<String>()
    private val layoutUndo=mutableListOf<String>()
    fun t(zh:String,en:String)=if(locale=="zh")zh else en
    fun language(){locale=if(locale=="zh")"en" else "zh";prefs.edit().putString("locale",locale).apply()}
    fun run(block:suspend()->Unit){viewModelScope.launch{busy=true;error="";try{block()}catch(e:Exception){error=e.message?:"Request failed"}finally{busy=false}}}
    init {
        api.onEvent={event -> viewModelScope.launch{
            when(event.s("event")){
                "connected" -> {online=true;runCatching{refreshConversations();conversation?.let{loadMessages()}}}
                "disconnected" -> {online=false;delay(3000);if(user!=null)api.connect()}
                "conversation.read" -> {val data=event.o("data");if(data.s("conversationId")==conversation?.s("id") && data.s("userId")!=user?.s("id"))peerReadSequence=maxOf(peerReadSequence,data.optInt("sequence"));runCatching{refreshConversations()}}
                "message.created","conversation.created" -> runCatching{refreshConversations();if(conversation!=null)loadMessages()}
                "trip.updated" -> runCatching{loadTrips()}
                "profile.job.updated" -> if(job!=null)runCatching{job=api.call("/profile/jobs/${job!!.s("id")}")}
            }
        }}
        run {
            cache.get("places")?.let{places=JSONObject(it).a("items").objects()}
            val loaded=api.call("/places");places=loaded.a("items").objects();cache.put(CachedResource("places",loaded.toString()))
            if(api.session.get("access").isNotEmpty()) {user=api.call("/me");refreshFavorites();refreshConversations();api.connect()}
        }
    }
    fun requireLogin():Boolean {if(user==null){authReturnRoute=route;route="auth";return false};return true}
    fun back(){route=when(route){"public"->if(profileReturnRoute=="auth" && user!=null)"" else profileReturnRoute;"auth"->{pendingConnect=null;resumeConnectId="";authReturnRoute};"people"->"city";else->""}}
    fun updateSearch(value:String){query=value;searchResults=emptyList();searchCompleted=false;searching=false}
    fun search(){
        val term=query.trim()
        if(term.isEmpty()){updateSearch(query);return}
        searching=true
        run{try{
            val items=api.call("/places?q=${java.net.URLEncoder.encode(term,"UTF-8")}").a("items").objects()
            if(query.trim()==term){searchResults=items;searchCompleted=true}
        }finally{if(query.trim()==term)searching=false}}
    }
    fun select(place:JSONObject){
        globeCommand=json("bridgeVersion" to 1,"event" to "focusPlace","data" to json("place" to place))
        updateSearch("")
        when(place.s("kind")) {
            "city" -> {city=place;route="city"}
            "attraction" -> run{city=api.call("/places/${place.s("parentId")}");route="city"}
            "country" -> run{country=api.call("/places/${place.s("id")}");countryCities=api.call("/places?parentId=${place.s("id")}&kind=city").a("items").objects();route="country"}
        }
    }
    fun showUnlistedCountry(data:JSONObject){
        val name=data.s("geoName")
        if(name.isBlank())return
        country=json("id" to "geo-${data.s("geoId")}","kind" to "country","name" to json("zh" to name,"en" to name),"description" to json("zh" to "这个国家的资料暂未收录，更多介绍与城市内容正在准备中。你可以返回地球继续探索。","en" to "This country has not been added yet. Its introduction and cities are being prepared. Return to the globe to keep exploring."),"image" to "")
        countryCities=emptyList();route="country"
    }
    suspend fun refreshFavorites(){favorites=api.call("/favorites").a("items").objects().map{it.s("id")}.toSet()}
    fun favorite(){if(!requireLogin())return;city?.let{c->run{api.call("/favorites/${c.s("id")}",if(c.s("id") in favorites)"DELETE" else "PUT");refreshFavorites()}}}
    fun startPeople(){feedCities=setOf(city?.s("id").orEmpty()).filter{it.isNotBlank()}.toSet();coverage="any";restartPeople()}
    fun restartPeople(){feedGeneration++;people=emptyList();personIndex=0;feedId="";cursor=null;exhausted=false;peopleError="";pendingConnect=null;resumeConnectId="";route="people";viewModelScope.launch{loadPeople()}}
    fun retryPeople(){viewModelScope.launch{loadPeople()}}
    private suspend fun loadPeople(){
        val generation=feedGeneration
        if(loadingGeneration==generation)return
        val selectedCity=city?.s("id")?:return
        loadingGeneration=generation;peopleLoading=true;peopleError=""
        try {
            val result=api.call("/cities/$selectedCity/people-feed"+(if(feedId.isNotEmpty())"?feedId=$feedId&cursor=${cursor.orEmpty()}" else "?cityIds=${feedCities.sorted().joinToString(",")}&coverage=$coverage"))
            if(generation!=feedGeneration)return
            feedId=result.s("feedId");cursor=if(result.isNull("nextCursor"))null else result.s("nextCursor");exhausted=result.optBoolean("exhausted",cursor==null)
            people=people+result.a("items").objects().filter{p->people.none{it.s("id")==p.s("id")}}
        }catch(e:Exception){if(generation==feedGeneration)peopleError=e.message.orEmpty()}
        finally{if(generation==feedGeneration){peopleLoading=false;loadingGeneration=null}}
    }
    fun next(){if(personIndex<people.size)personIndex++;if(people.size-personIndex<3 && !exhausted)retryPeople()}
    fun advancePerson(id:String,generation:Int){if(generation==feedGeneration && people.getOrNull(personIndex)?.s("id")==id)next()}
    fun ensureConnectAuth(p:JSONObject):Boolean {
        if(user?.optBoolean("verified")==true)return true
        pendingConnect=p;pendingGeneration=feedGeneration;authReturnRoute=route;route="auth";return false
    }
    private fun resumePendingConnect(){pendingConnect?.let{p->if(user?.optBoolean("verified")==true && pendingGeneration==feedGeneration){pendingConnect=null;if(route=="people" && people.getOrNull(personIndex)?.s("id")==p.s("id"))resumeConnectId=p.s("id") else connectPerson(p)}}}
    fun refreshVerification(){run{user=api.call("/me");if(user?.optBoolean("verified")!=true)throw IllegalStateException(t("邮箱尚未验证，请打开验证邮件。","Open the verification email first."));route=authReturnRoute;resumePendingConnect()}}
    suspend fun connectForSwipe(p:JSONObject):Boolean {
        val personId=p.s("id")
        if(!ensureConnectAuth(p) || personId in connecting)return false
        connecting.add(personId);connectingPerson=personId;peopleError=""
        val personCities=p.a("cityIds").let{a->(0 until a.length()).map{a.optString(it)}}
        val cityId=feedCities.firstOrNull{it in personCities}?:city?.s("id")
        val generation=feedGeneration
        return try{api.call("/conversations/direct","POST",json("userId" to personId,"cityId" to cityId));newConversation=true;notice=t("已加入对话，继续探索","Added to chats. Keep exploring.");viewModelScope.launch{runCatching{refreshConversations()}};true}
        catch(e:Exception){if(generation==feedGeneration)peopleError=e.message.orEmpty();false}
        finally{connecting.remove(personId);if(connectingPerson==personId)connectingPerson=""}
    }
    fun connectPerson(p:JSONObject){if(!ensureConnectAuth(p))return;val generation=feedGeneration;viewModelScope.launch{if(connectForSwipe(p)){if(route=="people")advancePerson(p.s("id"),generation)}else if(route!="people")error=peopleError}}
    fun openProfile(id:String){notice="";val source=route;run{profile=api.call("/users/$id");profileReturnRoute=source;route="public"}}
    fun ownProfile(){if(!requireLogin())return;run{profile=api.call("/users/${user!!.s("id")}");route=""}}
    suspend fun refreshConversations(){val result=api.call("/conversations");conversations=result.a("items").objects();cache.put(CachedResource("conversations",result.toString()))}
    fun openConversation(c:JSONObject){conversation=c;messages=emptyList();initializedMessagesId="";hasOlderMessages=false;peerReadSequence=0;messageError="";route="conversation";viewModelScope.launch{messagesLoading=true;try{cache.get("messages:${c.s("id")}")?.let{if(conversation?.s("id")==c.s("id"))messages=JSONObject(it).a("items").objects().sortedBy{it.optInt("sequence")}};loadMessages();loadTrips()}catch(e:Exception){messageError=e.message.orEmpty()}finally{messagesLoading=false}}}
    suspend fun loadMessages(){
        val id=conversation?.s("id")?:return
        val result=api.call("/conversations/$id/messages");if(conversation?.s("id")!=id)return
        val incoming=result.a("items").objects()
        if(initializedMessagesId!=id){hasOlderMessages=!result.isNull("nextCursor") && result.s("nextCursor").isNotBlank();initializedMessagesId=id}
        messages=(messages+incoming).distinctBy{it.s("id")}.sortedBy{it.optInt("sequence")};cache.put(CachedResource("messages:$id",json("items" to JSONArray(messages)).toString()))
        messages.forEach{outgoing.remove(it.s("clientMessageId"))}
        messages.lastOrNull()?.let{api.call("/conversations/$id/read","PUT",json("sequence" to it.optInt("sequence")))}
    }
    fun history(){if(historyLoading)return;val id=conversation?.s("id")?:return;val first=messages.firstOrNull()?.optInt("sequence")?:return;viewModelScope.launch{historyLoading=true;try{val value=api.call("/conversations/$id/messages?before=$first");if(conversation?.s("id")==id){messages=(value.a("items").objects()+messages).distinctBy{it.s("id")}.sortedBy{it.optInt("sequence")};hasOlderMessages=!value.isNull("nextCursor") && value.s("nextCursor").isNotBlank()}}catch(e:Exception){messageError=e.message.orEmpty()}finally{historyLoading=false}}}
    fun send(body:String,type:String="text",data:JSONObject?=null,clientId:String=UUID.randomUUID().toString()){
        if(body.isBlank() || outgoing[clientId]?.s("delivery")=="sending")return
        val id=conversation?.s("id")?:return
        val pending=json("id" to "local-$clientId","conversationId" to id,"senderId" to user?.s("id"),"clientMessageId" to clientId,"sequence" to Int.MAX_VALUE,"createdAt" to Instant.now().toString(),"type" to type,"body" to body,"data" to (data?:JSONObject()),"delivery" to "sending")
        outgoing[clientId]=pending
        viewModelScope.launch{try{val result=api.call("/conversations/$id/messages","POST",json("clientMessageId" to clientId,"type" to type,"body" to body,"data" to (data?:JSONObject())));if(conversation?.s("id")==id)messages=(messages+result).distinctBy{it.s("id")}.sortedBy{it.optInt("sequence")};outgoing.remove(clientId);runCatching{refreshConversations()}}catch(e:Exception){outgoing[clientId]=JSONObject(pending.toString()).put("delivery","failed")}}
    }
    fun retryMessage(m:JSONObject){send(m.s("body"),m.s("type"),m.o("data"),m.s("clientMessageId"))}
    suspend fun loadTrips(){conversation?.let{trips=api.call("/conversations/${it.s("id")}/trips").a("items").objects()}}
    fun createTrip(title:String,date:String){run{val end=runCatching{Instant.parse(date)}.getOrElse{throw IllegalArgumentException(t("请输入 UTC 时间，例如 2026-12-01T18:00:00Z","Use ISO UTC, e.g. 2026-12-01T18:00:00Z"))};api.call("/conversations/${conversation!!.s("id")}/trips","POST",json("cityId" to (conversation!!.s("cityId").ifEmpty{city?.s("id").orEmpty()}),"title" to title,"endAt" to end.toString()));loadTrips()}}
    fun tripAction(trip:JSONObject,action:String){run{try{api.call("/trips/${trip.s("id")}/$action","POST",if(action=="accept")json("expectedEndAt" to trip.s("endAt")) else JSONObject())}catch(e:Exception){runCatching{loadTrips()};throw e};loadTrips()}}
    fun editTrip(trip:JSONObject,date:String){run{api.call("/trips/${trip.s("id")}","PATCH",json("endAt" to date));loadTrips();notice=t("结束时间已修改，等待对方重新确认","End time updated; waiting for the other person to accept again.")}}
    fun review(trip:JSONObject,rating:Int,body:String){run{api.call("/trips/${trip.s("id")}/reviews","POST",json("rating" to rating,"body" to body));notice=t("评价已提交","Review submitted")}}
    fun edit(){if(!requireLogin())return;run{draft=api.call("/profile/draft");layout=JSONObject(draft.o("layout").toString());route="edit"}}
    fun changeLayout(value:JSONObject){layoutUndo.add(layout.toString());layout=JSONObject(value.toString())}
    fun undoLayout(){if(layoutUndo.isNotEmpty())layout=JSONObject(layoutUndo.removeAt(layoutUndo.lastIndex))}
    fun restoreRevision(revision:Int){run{draft=api.call("/profile/restore","POST",json("revision" to revision));layout=JSONObject(draft.o("layout").toString());layoutUndo.clear()}}
    suspend fun saveDraft(){draft=api.call("/profile/draft","PUT",json("revision" to draft.optInt("revision"),"layout" to layout));layout=JSONObject(draft.o("layout").toString())}
    fun save(publish:Boolean=false){run{saveDraft();if(publish){api.call("/profile/publish","POST",json("revision" to draft.optInt("revision")));profile=api.call("/users/${user!!.s("id")}");notice=t("主页已发布","Profile published")}}}
    fun generate(prompt:String){run{saveDraft();job=api.call("/profile/jobs","POST",json("prompt" to prompt,"baseRevision" to draft.optInt("revision")));while(job?.s("status") in listOf("queued","running","validating")){val id=job?.s("id")?:break;delay(1500);if(job==null)break;job=api.call("/profile/jobs/$id")}}}
    fun applyJob(){run{if(layout.toString()!=draft.o("layout").toString())error(t("草稿有未保存修改，请先保存后再处理生成结果","You have unsaved edits. Save your draft before applying this result."));draft=api.call("/profile/jobs/${job!!.s("id")}/apply","POST",json("revision" to draft.optInt("revision")));layout=JSONObject(draft.o("layout").toString());job=null}}
    fun cancelJob(){run{job?.let{api.call("/profile/jobs/${it.s("id")}","DELETE")};job=null}}
    fun restore(){run{val history=api.call("/profile/history").a("items").objects();val last=history.lastOrNull()?:error(t("暂无历史版本","No history yet"));draft=api.call("/profile/restore","POST",json("revision" to last.optInt("revision")));layout=JSONObject(draft.o("layout").toString())}}
    fun loadPosts(){run{posts=api.call("/posts?cityId=${city?.s("id").orEmpty()}").a("items").objects();route="posts"}}
    fun post(title:String,body:String){if(!requireLogin())return;run{api.call("/posts","POST",json("cityId" to city?.s("id"),"title" to title,"body" to body,"images" to JSONArray()));posts=api.call("/posts?cityId=${city?.s("id").orEmpty()}").a("items").objects()}}
    fun like(p:JSONObject){if(!requireLogin())return;run{api.call("/posts/${p.s("id")}/like",if(p.optBoolean("liked"))"DELETE" else "PUT");posts=api.call("/posts?cityId=${city?.s("id").orEmpty()}").a("items").objects()}}
    fun report(type:String,id:String,reason:String){if(!requireLogin())return;run{api.call("/reports","POST",json("targetType" to type,"targetId" to id,"reason" to reason));notice=t("举报已提交","Report submitted")}}
    fun block(id:String){run{api.call("/blocks/$id","PUT");notice=t("已拉黑","Blocked");route=""}}
    fun upload(uri:Uri,purpose:String,onUploaded:(JSONObject)->Unit){run{onUploaded(api.upload(uri,purpose))}}
    fun logout(){run{runCatching{api.call("/auth/logout","POST",json("refreshToken" to api.session.get("refresh")))};api.disconnect();api.session.clear();cache.clear();user=null;pendingConnect=null;resumeConnectId="";outgoing.clear();conversations=emptyList();messages=emptyList();favorites=emptySet();profile=JSONObject();draft=JSONObject();job=null;route=""}}
    fun signedIn(value:JSONObject){api.saveSession(value);run{user=api.call("/me");route=if(pendingConnect!=null && user?.optBoolean("verified")!=true)"auth" else authReturnRoute;if(tab==2 && route.isEmpty())profile=api.call("/users/${user!!.s("id")}");refreshFavorites();refreshConversations();api.connect();resumePendingConnect()}}
}
