package app.ourworld

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.core.view.WindowCompat
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import coil.request.ImageRequest
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlinx.coroutines.delay

private val Night=OWVisual.bg
private val NightSurface=OWVisual.surface
private val Moon=OWVisual.ink
private val MoonMuted=OWVisual.inkMuted
private val Paper=OWVisual.bg
private val Ink=OWVisual.ink
private val Coral=OWVisual.accent

class MainActivity:ComponentActivity(){
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        setContent{
            val vm:WorldModel=viewModel()
            val context=LocalContext.current
            val body=remember(vm.locale){runCatching{FontFamily(android.graphics.Typeface.createFromAsset(context.assets,if(vm.locale=="zh")"fonts/NotoSansSC.ttf" else "fonts/Manrope.ttf"))}.getOrDefault(FontFamily.SansSerif)}
            val display=body
            val base=Typography()
            val typography=base.copy(bodyLarge=base.bodyLarge.copy(fontFamily=body),bodyMedium=base.bodyMedium.copy(fontFamily=body),bodySmall=base.bodySmall.copy(fontFamily=body),labelLarge=base.labelLarge.copy(fontFamily=body),headlineLarge=base.headlineLarge.copy(fontFamily=display),headlineSmall=base.headlineSmall.copy(fontFamily=display),titleLarge=base.titleLarge.copy(fontFamily=display),titleMedium=base.titleMedium.copy(fontFamily=display))
            MaterialTheme(colorScheme=lightColorScheme(primary=Coral,onPrimary=OWVisual.bg,secondary=Coral,background=Paper,onBackground=Ink,surface=OWVisual.surface,onSurface=Ink,surfaceVariant=OWVisual.raised,onSurfaceVariant=OWVisual.inkMuted,outline=OWVisual.line,secondaryContainer=OWVisual.raised,onSecondaryContainer=Ink),typography=typography){Ourworld(vm)}
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun Ourworld(vm:WorldModel=viewModel()) {
    val t=vm::t
    val globePage=vm.tab==0 && vm.route in listOf("","city","country","people")
    val activity=LocalContext.current as? ComponentActivity
    val view=LocalView.current
    SideEffect {
        activity?.window?.let { window ->
            WindowCompat.getInsetsController(window,view).apply {
                isAppearanceLightStatusBars=!globePage
                isAppearanceLightNavigationBars=!globePage
            }
            if(android.os.Build.VERSION.SDK_INT<35){
                window.statusBarColor=(if(globePage)Night else Paper).toArgb()
                window.navigationBarColor=(if(globePage)Night else Paper).toArgb()
            }
        }
    }
    BackHandler(enabled=vm.route.isNotEmpty()){vm.back()}
    Scaffold(containerColor=if(globePage)Night else Paper,bottomBar={
        if(vm.route!="conversation" && vm.route!="public")NavigationBar(containerColor=if(globePage)Night else Paper,tonalElevation=0.dp) {
            listOf(Icons.Outlined.Public to t("地球","Earth"),Icons.Outlined.ChatBubbleOutline to t("聊天","Chat"),Icons.Outlined.PersonOutline to "Profile").forEachIndexed { index,item ->
                NavigationBarItem(selected=vm.tab==index,onClick={vm.notice="";vm.tab=index;vm.route="";if(index==1){vm.newConversation=false;if(vm.requireLogin())vm.run{vm.refreshConversations()}};if(index==2)vm.ownProfile()},icon={BadgedBox(badge={if(index==1 && vm.newConversation)Badge()}){Icon(item.first,item.second)}},alwaysShowLabel=false,colors=if(globePage)NavigationBarItemDefaults.colors(selectedIconColor=Moon,unselectedIconColor=MoonMuted,indicatorColor=Color.Transparent) else NavigationBarItemDefaults.colors())
            }
        }
    }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            // One persistent globe across destinations; hidden surfaces are paused, never rebuilt.
            Box(Modifier.fillMaxSize().graphicsLayer{alpha=if(globePage)1f else 0f}){Explore(vm)}
            when(vm.route){
                "auth" -> Auth(vm)
                "people" -> People(vm)
                "public" -> PublicProfile(vm)
                "conversation" -> ConversationView(vm)
                "edit" -> ProfileEditor(vm)
                "settings" -> Settings(vm)
                "packages" -> PackageForm(vm)
                "verification" -> VerificationForm(vm)
                "posts" -> Community(vm)
                else -> when(vm.tab){1->ConversationList(vm);2->OwnProfile(vm)}
            }
            if(vm.busy && !globePage)LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
            if(vm.error.isNotEmpty())Box(Modifier.align(Alignment.TopCenter)){Status(vm.error,true){vm.error=""}}
            if(vm.notice.isNotEmpty())Box(Modifier.align(Alignment.BottomCenter).padding(12.dp)){Surface(shape=RoundedCornerShape(16.dp),color=OWVisual.surface){Text(vm.notice,color=OWVisual.ink,fontSize=14.sp,modifier=Modifier.padding(16.dp))}}
        }
    }
    LaunchedEffect(vm.notice){val current=vm.notice;if(current.isNotEmpty()){delay(3200);if(vm.notice==current)vm.notice=""}}
    if(vm.route=="country" && vm.country!=null)ModalBottomSheet(onDismissRequest={vm.route=""},containerColor=Paper){
        Column(Modifier.fillMaxWidth().fillMaxHeight(.85f)) {
            Header(vm,vm.country!!.localized("name",vm.locale))
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=24.dp),verticalArrangement=Arrangement.spacedBy(18.dp)) {
                Picture(vm.country!!.s("image"),220)
                Text(vm.country!!.localized("description",vm.locale),style=MaterialTheme.typography.bodyLarge)
                Text(vm.t("探索城市","Explore cities"),style=MaterialTheme.typography.titleLarge)
                if(vm.countryCities.isEmpty())Text(vm.t("更多城市正在准备中","More cities are on the way"))
                vm.countryCities.forEach { place ->
                    OutlinedCard(onClick={vm.select(place)},modifier=Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                            Picture(place.s("image"),120)
                            Text(place.localized("name",vm.locale),style=MaterialTheme.typography.titleLarge)
                            Text(place.localized("description",vm.locale),maxLines=2)
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }
    if(vm.route=="city" && vm.city!=null)ModalBottomSheet(onDismissRequest={vm.route=""},containerColor=Paper){
        Column(Modifier.fillMaxWidth().fillMaxHeight(.67f).verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
            Row(verticalAlignment=Alignment.CenterVertically){Text(vm.city!!.localized("name",vm.locale),style=MaterialTheme.typography.headlineLarge,modifier=Modifier.weight(1f));TextButton(onClick=vm::language){Text(if(vm.locale=="zh")"EN" else "中")}}
            Picture(vm.city!!.s("image"),220)
            Text(vm.city!!.localized("description",vm.locale))
            Action(t("找当地人","Meet a local")){vm.startPeople()}
            OutlinedButton(onClick=vm::favorite,modifier=Modifier.fillMaxWidth()){Text(if(vm.city!!.s("id") in vm.favorites)t("取消收藏","Remove saved city") else t("收藏城市","Save city"))}
            OutlinedButton(onClick=vm::loadPosts,modifier=Modifier.fillMaxWidth()){Text(t("城市故事","City stories"))}
        }
    }
}

@Composable fun Status(value:String,error:Boolean=false,onDismiss:()->Unit){Surface(color=if(error)OWVisual.nope.copy(alpha=.16f) else OWVisual.like.copy(alpha=.16f)){Row(Modifier.fillMaxWidth().padding(start=14.dp),verticalAlignment=Alignment.CenterVertically){Text(value,Modifier.weight(1f),color=OWVisual.ink);IconButton(onClick=onDismiss){Icon(Icons.Outlined.Close,"Close",tint=OWVisual.ink)}}}}
@Composable fun Action(text:String,enabled:Boolean=true,onClick:()->Unit){Button(onClick=onClick,enabled=enabled,modifier=Modifier.fillMaxWidth().heightIn(min=OWVisual.spacing_touch.dp),shape=RoundedCornerShape(OWVisual.radii_control.dp)){Text(text,fontWeight=FontWeight.SemiBold)}}
@Composable fun Field(value:String,label:String,secret:Boolean=false,onChange:(String)->Unit){OutlinedTextField(value,onChange,label={Text(label)},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(16.dp),visualTransformation=if(secret)androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)}
@Composable fun Header(vm:WorldModel,title:String,back:()->Unit={vm.back()}){Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically){IconButton(onClick=back){Icon(Icons.Outlined.ArrowBack,vm.t("返回","Back"))};Text(title,style=MaterialTheme.typography.titleLarge,modifier=Modifier.weight(1f));TextButton(onClick=vm::language){Text(if(vm.locale=="zh")"EN" else "中")}}}
@Composable fun Form(vm:WorldModel,title:String,content:@Composable ColumnScope.()->Unit){Column(Modifier.fillMaxSize().background(Paper)){Header(vm,title);Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp),content=content)}}
@Composable fun NativePhoto(url:String,modifier:Modifier=Modifier,description:String?=null){
    val context=LocalContext.current
    val resolved=nativeMediaUrl(url)
    val request=ImageRequest.Builder(context).data(resolved).apply{if(sameMediaOrigin(resolved))addHeader("Authorization","Bearer ${SecureSession(context).get("access")}")}.build()
    SubcomposeAsyncImage(model=request,contentDescription=description,modifier=modifier.background(OWVisual.raised),contentScale=ContentScale.Crop,alignment=Alignment.TopCenter,loading={Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){CircularProgressIndicator(Modifier.size(24.dp),strokeWidth=2.dp)}},error={Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){Icon(Icons.Outlined.ImageNotSupported,description,tint=OWVisual.inkMuted)}})
}
@Composable fun Picture(url:String,height:Int=180){if(url.isNotBlank())NativePhoto(url,Modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(OWVisual.radii_card.dp)))}
@Composable fun EndDateField(vm:WorldModel,value:String,onChange:(String)->Unit){
    val context=LocalContext.current
    val calendar=java.util.Calendar.getInstance()
    val label=runCatching{java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))}.getOrDefault(vm.t("选择行程结束时间","Choose trip end time"))
    OutlinedButton(onClick={android.app.DatePickerDialog(context,{_,year,month,day->android.app.TimePickerDialog(context,{_,hour,minute->onChange(java.time.ZonedDateTime.of(year,month+1,day,hour,minute,0,0,java.time.ZoneId.systemDefault()).toInstant().toString())},calendar.get(java.util.Calendar.HOUR_OF_DAY),calendar.get(java.util.Calendar.MINUTE),true).show()},calendar.get(java.util.Calendar.YEAR),calendar.get(java.util.Calendar.MONTH),calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()},modifier=Modifier.fillMaxWidth()){Text(label)}
}

@Composable fun Explore(vm:WorldModel){
    val keyboard=LocalSoftwareKeyboardController.current
    LaunchedEffect(vm.query){if(vm.query.isNotBlank()){delay(300);vm.search()}}
    Box(Modifier.fillMaxSize().background(Night)) {
        Globe(vm)
        if(vm.tab==0 && vm.route in listOf("","country","city"))Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal=20.dp,vertical=14.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            OutlinedTextField(
                value=vm.query,onValueChange=vm::updateSearch,
                placeholder={Text(vm.t("搜索国家、城市或景点","Search countries, cities or places"),maxLines=1)},
                leadingIcon={IconButton(onClick={vm.search();keyboard?.hide()}){Icon(Icons.Outlined.Search,vm.t("搜索","Search"))}},
                trailingIcon={if(vm.query.isNotEmpty())IconButton(onClick={vm.updateSearch("")}){Icon(Icons.Outlined.Close,vm.t("清除搜索","Clear search"))}},
                modifier=Modifier.fillMaxWidth(),singleLine=true,shape=RoundedCornerShape(28.dp),
                keyboardOptions=KeyboardOptions(imeAction=ImeAction.Search),keyboardActions=KeyboardActions(onSearch={vm.search();keyboard?.hide()}),
                colors=OutlinedTextFieldDefaults.colors(focusedContainerColor=NightSurface.copy(alpha=.90f),unfocusedContainerColor=NightSurface.copy(alpha=.88f),focusedTextColor=Moon,unfocusedTextColor=Moon,focusedPlaceholderColor=MoonMuted,unfocusedPlaceholderColor=MoonMuted,focusedLeadingIconColor=Moon,unfocusedLeadingIconColor=Moon,focusedTrailingIconColor=MoonMuted,unfocusedTrailingIconColor=MoonMuted,cursorColor=Moon,selectionColors=TextSelectionColors(handleColor=Moon,backgroundColor=Moon.copy(alpha=.25f)),focusedBorderColor=Moon.copy(alpha=.42f),unfocusedBorderColor=Moon.copy(alpha=.16f))
            )
            if(vm.query.isNotBlank() && (vm.searching || vm.searchCompleted))Surface(shape=RoundedCornerShape(22.dp),color=NightSurface.copy(alpha=.97f),contentColor=Moon){
                Column(Modifier.fillMaxWidth().heightIn(max=320.dp).verticalScroll(rememberScrollState())){
                    if(vm.searching)LinearProgressIndicator(Modifier.fillMaxWidth(),color=MoonMuted,trackColor=Moon.copy(alpha=.12f))
                    if(vm.searchCompleted && vm.searchResults.isEmpty())Text(vm.t("没有找到，试试其他名称","No matches. Try another name."),Modifier.padding(20.dp))
                    vm.searchResults.forEach{place ->
                        TextButton(onClick={keyboard?.hide();vm.select(place)},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(12.dp),colors=ButtonDefaults.textButtonColors(contentColor=Moon)){
                            Column(Modifier.weight(1f).padding(horizontal=12.dp,vertical=5.dp)){
                                Text(place.localized("name",vm.locale),style=MaterialTheme.typography.bodyLarge)
                                Text(when(place.s("kind")){"country"->vm.t("国家","Country");"city"->vm.t("城市","City");else->vm.t("景点","Place")},style=MaterialTheme.typography.bodySmall,color=MoonMuted)
                            }
                            Icon(Icons.Outlined.ChevronRight,null,Modifier.padding(end=12.dp))
                        }
                    }
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable fun Globe(vm:WorldModel){
    var web by remember{mutableStateOf<WebView?>(null)}
    val context=LocalContext.current
    fun command(value:JSONObject){web?.evaluateJavascript("window.OurworldGlobe&&window.OurworldGlobe.receive(${value});",null)}
    AndroidView(factory={
        WebView(context).apply {
            setBackgroundColor(OWVisual.bg.toArgb());settings.javaScriptEnabled=true;settings.domStorageEnabled=false;settings.allowFileAccess=false;settings.allowContentAccess=false
            val loader=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(context)).build()
            webViewClient=object:WebViewClientCompat(){override fun shouldInterceptRequest(view:WebView,request:android.webkit.WebResourceRequest)=loader.shouldInterceptRequest(request.url);override fun shouldOverrideUrlLoading(view:WebView,request:android.webkit.WebResourceRequest)=request.url.host!="appassets.androidplatform.net"}
            addJavascriptInterface(object {
                @JavascriptInterface fun postMessage(raw:String) {
                    runCatching {
                        val event=JSONObject(raw)
                        if(event.optInt("bridgeVersion")!=1)return
                        post {
                            when(event.s("event")) {
                                "rendererReady" -> {
                                    command(json("bridgeVersion" to 1,"event" to "setMarkers","data" to json("places" to JSONArray(vm.places),"favoriteIds" to JSONArray(vm.favorites.toList()))))
                                    vm.savedCamera?.let { command(json("bridgeVersion" to 1,"event" to "restoreCamera","data" to it)) }
                                    command(json("bridgeVersion" to 1,"event" to "setActive","data" to json("active" to (vm.tab==0 && vm.route in listOf("","city","country")))))
                                }
                                "cameraChanged" -> vm.savedCamera=event.o("data")
                                "placeSelected" -> {
                                    val data=event.o("data")
                                    val id=data.s("placeId",data.s("id",data.o("place").s("id")))
                                    val place=vm.places.firstOrNull{it.s("id")==id}
                                    when {
                                        place!=null -> vm.select(place)
                                        data.o("place").s("id").isNotBlank() -> vm.select(data.o("place"))
                                        data.s("geoName").isNotBlank() -> vm.showUnlistedCountry(data)
                                    }
                                }
                            }
                        }
                    }
                }
            },"AndroidGlobe")
            loadUrl("https://appassets.androidplatform.net/assets/globe/index.html");web=this
        }
    },modifier=Modifier.fillMaxSize())
    LaunchedEffect(vm.places,vm.favorites){command(json("bridgeVersion" to 1,"event" to "setMarkers","data" to json("places" to JSONArray(vm.places),"favoriteIds" to JSONArray(vm.favorites.toList()))))}
    LaunchedEffect(vm.globeCommand){vm.globeCommand?.let(::command)}
    LaunchedEffect(vm.tab,vm.route){command(json("bridgeVersion" to 1,"event" to "setActive","data" to json("active" to (vm.tab==0 && vm.route in listOf("","city","country")))))}
    DisposableEffect(Unit){onDispose{command(json("bridgeVersion" to 1,"event" to "setActive","data" to json("active" to false)));web?.removeJavascriptInterface("AndroidGlobe");web?.destroy()}}
}

@Composable fun People(vm:WorldModel){
    var chooseCities by remember{mutableStateOf(false)}
    var pendingCities by remember{mutableStateOf(setOf<String>())}
    var pendingCoverage by remember{mutableStateOf("any")}
    DiscoveryDeck(vm){pendingCities=vm.feedCities;pendingCoverage=vm.coverage;chooseCities=true}
    if(chooseCities)AlertDialog(
        onDismissRequest={chooseCities=false},
        title={Text(vm.t("选择服务城市","Choose service cities"))},
        text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
            Row { FilterChip(selected=pendingCoverage=="any",onClick={pendingCoverage="any"},label={Text(vm.t("分别找人","Find separately"))});Spacer(Modifier.width(8.dp));FilterChip(selected=pendingCoverage=="all",onClick={pendingCoverage="all"},label={Text(vm.t("一人覆盖全部","One person, all cities"))}) }
            Column(Modifier.heightIn(max=300.dp).verticalScroll(rememberScrollState())) {
                vm.places.filter{it.s("kind")=="city"}.forEach { place ->
                    val selected=place.s("id") in pendingCities
                    Row(verticalAlignment=Alignment.CenterVertically){Checkbox(checked=selected,onCheckedChange={pendingCities=if(it)pendingCities+place.s("id") else pendingCities-place.s("id")});Text(place.localized("name",vm.locale))}
                }
            }
        }},
        confirmButton={TextButton(enabled=pendingCities.isNotEmpty(),onClick={vm.feedCities=pendingCities;vm.coverage=pendingCoverage;chooseCities=false;vm.restartPeople()}){Text(vm.t("开始随机浏览","Start random cards"))}},
        dismissButton={TextButton(onClick={chooseCities=false}){Text(vm.t("取消","Cancel"))}}
    )

}

@Composable fun ConversationList(vm:WorldModel){TravelConversations(vm)}

@Composable fun ConversationView(vm:WorldModel){TravelChat(vm)}

@Composable fun TripCard(vm:WorldModel,trip:JSONObject){
    var review by remember{mutableStateOf("")}
    var rating by remember{mutableIntStateOf(5)}
    var editing by remember{mutableStateOf(false)}
    var date by remember(trip.s("id")){mutableStateOf(trip.s("endAt"))}
    OutlinedCard {
        Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Text(trip.s("title"),style=MaterialTheme.typography.titleMedium)
            Text(trip.s("endAt"))
            Text(trip.s("status")+if(trip.optBoolean("frozen"))" · "+vm.t("争议冻结","Frozen") else "")
            when(trip.s("status")) {
                "proposed" -> if(trip.s("creatorId")!=vm.user?.s("id"))Action(vm.t("接受行程","Accept trip")){vm.tripAction(trip,"accept")}
                "active" -> if(!trip.optBoolean("frozen"))Action(vm.t("确认已结束","Confirm trip ended")){vm.tripAction(trip,"confirm-end")}
                "reviewable" -> if(!trip.optBoolean("frozen")){
                    Text(vm.t("线下行程评价","Trip review"))
                    Row{(1..5).forEach{score->TextButton(onClick={rating=score}){Text(if(score<=rating)"★" else "☆")}}}
                    Field(review,vm.t("服务评价","Review")){review=it}
                    Action(vm.t("提交评价","Submit review")){vm.review(trip,rating,review)}
                }
            }
            if(!trip.optBoolean("frozen") && trip.s("status")!="cancelled"){
                TextButton(onClick={editing=!editing}){Text(vm.t("调整结束时间","Change end time"))}
                if(editing){
                    Text(vm.t("修改后需要对方重新确认","The other person must accept the revised trip."))
                    EndDateField(vm,date){date=it}
                    Action(vm.t("发送修改","Send revision")){vm.editTrip(trip,date);editing=false}
                }
            }
            if(trip.s("status") in listOf("proposed","active"))TextButton(onClick={vm.tripAction(trip,"cancel")}){Text(vm.t("取消行程","Cancel trip"))}
        }
    }
}

@Composable fun OwnProfile(vm:WorldModel){
    if(vm.user==null){Auth(vm);return}
    LaunchedEffect(vm.user?.s("id")){vm.ownProfile()}
    Form(vm,"Profile"){
        Picture(vm.user!!.s("avatar"),300)
        Text(vm.user!!.s("name"),style=MaterialTheme.typography.headlineLarge)
        Text(vm.user!!.s("bio"))
        Text(if(vm.user!!.s("id").startsWith("demo-"))vm.t("AI 演示人物","AI demo profile") else vm.user!!.s("providerStatus"),color=OWVisual.inkMuted,fontSize=12.sp)
        Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
            Button(onClick=vm::edit){Text(vm.t("搭建主页","Build profile"))}
            OutlinedButton(onClick={vm.route="settings"}){Text(vm.t("设置","Settings"))}
        }
        Row{
            TextButton(onClick={vm.route="packages"}){Text(vm.t("发布服务","Publish service"))}
            TextButton(onClick={vm.route="verification"}){Text(vm.t("资料认证","Verification"))}
        }
        RenderProfile(vm,vm.profile)
    }
}
@Composable fun PublicProfile(vm:WorldModel){TravelPublicProfile(vm)}

fun profileRows(blocks:List<JSONObject>):List<List<JSONObject>> {
    val rows=mutableListOf<List<JSONObject>>();var half:JSONObject?=null
    blocks.forEach { block -> if(block.optInt("span")==2) {half?.let{rows.add(listOf(it))};half=null;rows.add(listOf(block))} else if(half!=null) {rows.add(listOf(half!!,block));half=null} else half=block }
    half?.let{rows.add(listOf(it))};return rows
}
@Composable fun RenderProfile(vm:WorldModel,resource:JSONObject,custom:JSONObject?=null,publicView:Boolean=false){
    val profileLayout=custom?:resource.o("layout")
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        profileRows(profileLayout.a("blocks").objects().filter{!publicView || profileBlockVisible(resource,it)}).forEach { row ->
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                row.forEach { block -> Box(Modifier.weight(1f)){ProfileBlockView(vm,resource,profileLayout,block,publicView)} }
                if(row.size==1 && row.first().optInt("span")==1)Spacer(Modifier.weight(1f))
            }
        }
    }
}
@Composable fun ProfileBlockView(vm:WorldModel,resource:JSONObject,profileLayout:JSONObject,block:JSONObject,publicView:Boolean=false){
    val source=resource.o("user");val type=block.s("type");val refs=block.a("refs").let{a->(0 until a.length()).map{a.optString(it)}}
    val accent=runCatching{Color(android.graphics.Color.parseColor(profileLayout.s("accent")))}.getOrDefault(Coral)
    Surface(color=if(publicView && profileLayout.s("theme")=="nocturne")Color.Transparent else OWVisual.bg,shape=RoundedCornerShape(16.dp),modifier=Modifier.fillMaxWidth()){
        Column(Modifier.padding(if(publicView)0.dp else if(block.s("size")=="expanded")24.dp else 16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
            Text(block.s("title").ifEmpty{blockTitle(vm,type)},style=MaterialTheme.typography.titleMedium,color=accent)
            when(type){
                "intro" -> Text(block.s("content").ifEmpty{source.s("bio")})
                "skills" -> Text(source.a("tags").join(" · "))
                "cities" -> Text(referencedResources(resource.a("places").objects().filter{it.s("id") in source.a("cityIds").let{a->(0 until a.length()).map{a.optString(it)}}},refs){it.s("id")}.joinToString(" · "){it.localized("name",vm.locale)})
                "gallery" -> block.a("refs").let{refs->(0 until refs.length()).forEach{Picture(refs.optString(it))}}
                "packages" -> referencedResources(resource.a("packages").objects(),refs){it.s("id")}.forEach{p->Text(p.s("title"));Text(p.s("description"));Text(p.s("price")+" "+p.s("currency")+" / "+p.s("unit"))}
                "posts" -> referencedResources(resource.a("posts").objects(),refs){it.s("id")}.forEach{p->Text(p.s("title"));Text(p.s("body"))}
                "reviews" -> referencedResources(resource.a("reviews").objects(),refs){it.s("id")}.forEach{r->Text("★ ${r.optInt("rating")}  ${r.s("body")}")}
                "social" -> source.a("socialLinks").objects().forEach{link->Text(link.s("label")+" · "+link.s("url"))}
                "experiences" -> Text(block.s("content",vm.t("编辑你的旅行故事","Add your travel story")))
            }
        }
    }
}
fun blockTitle(vm:WorldModel,type:String)=when(type){"intro"->vm.t("关于我","About");"gallery"->vm.t("照片","Gallery");"experiences"->vm.t("旅行经历","Experiences");"skills"->vm.t("特长与兴趣","Skills");"cities"->vm.t("服务城市","Cities");"packages"->vm.t("服务套餐","Services");"posts"->vm.t("我的动态","Stories");"reviews"->vm.t("服务评价","Reviews");else->vm.t("社交链接","Social")}

@Composable fun ProfileEditor(vm:WorldModel){
    var prompt by remember{mutableStateOf("")};var preview by remember{mutableStateOf(false)};var history by remember{mutableStateOf(listOf<JSONObject>())};var showHistory by remember{mutableStateOf(false)}
    fun update(blocks:List<JSONObject>){vm.changeLayout(JSONObject(vm.layout.toString()).put("blocks",JSONArray(blocks)))}
    fun move(index:Int,delta:Int){val blocks=vm.layout.a("blocks").objects().toMutableList();val target=index+delta;if(target in blocks.indices){val a=blocks.removeAt(index);blocks.add(target,a);update(blocks)}}
    val photo=rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->uri?.let{vm.upload(it,"public"){file->val blocks=vm.layout.a("blocks").objects().map{JSONObject(it.toString())}.toMutableList();val gallery=blocks.firstOrNull{b->b.s("type")=="gallery"}?:json("id" to UUID.randomUUID().toString(),"type" to "gallery","span" to 2,"size" to "expanded").also{blocks.add(it)};gallery.put("refs",gallery.a("refs").put(file.s("url")));update(blocks)}}}
    Form(vm,vm.t("搭建我的主页","Build my profile")){
        Text(vm.t("长按拖动组件，或使用箭头排序。先预览，再发布。","Long press to reorder, or use arrows. Preview before publishing."))
        Row{listOf("ocean","forest","nocturne").forEach{theme->TextButton(onClick={vm.changeLayout(JSONObject(vm.layout.toString()).put("theme",theme))}){Text(theme)}}}
        Field(vm.layout.s("accent"),vm.t("强调色 HEX","Accent HEX")){vm.changeLayout(JSONObject(vm.layout.toString()).put("accent",it))}
        Field(prompt,vm.t("用自然语言描述你想要的主页","Describe your ideal profile")){prompt=it}
        Action(vm.t("让 Agent 排版","Design with Agent"),prompt.isNotBlank()&&!vm.busy){vm.generate(prompt)}
        vm.job?.let{j->Text(j.s("status")+" "+j.s("error"));if(j.s("status")=="ready"){RenderProfile(vm,vm.profile,j.o("layout"));Action(vm.t("应用此预览到草稿","Apply preview to draft")){vm.applyJob()}};TextButton(onClick=vm::cancelJob){Text(vm.t("取消生成","Cancel generation"))}}
        Row{TextButton(onClick={preview=!preview}){Text(vm.t("切换预览","Toggle preview"))};TextButton(onClick={photo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))}){Text(vm.t("添加照片","Add photo"))};TextButton(onClick=vm::undoLayout){Text(vm.t("撤销","Undo"))};TextButton(onClick={vm.run{history=vm.api.call("/profile/history").a("items").objects();showHistory=true}}){Text(vm.t("历史版本","History"))}}
        if(preview)RenderProfile(vm,vm.profile,vm.layout) else vm.layout.a("blocks").objects().forEachIndexed{index,block->
            var dy by remember(block.s("id")){mutableFloatStateOf(0f)}
            OutlinedCard(Modifier.fillMaxWidth().pointerInput(block.s("id")){detectDragGesturesAfterLongPress(onDragEnd={if(kotlin.math.abs(dy)>50)move(index,if(dy>0)1 else -1);dy=0f},onDragCancel={dy=0f}){change,amount->change.consume();dy+=amount.y}}){Column(Modifier.padding(14.dp)){
                Text(blockTitle(vm,block.s("type")),style=MaterialTheme.typography.titleMedium)
                Field(block.s("title"),vm.t("标题","Title")){value->val blocks=vm.layout.a("blocks").objects().map{JSONObject(it.toString())};blocks[index].put("title",value);update(blocks)}
                if(block.s("type") in listOf("intro","experiences"))Field(block.s("content"),vm.t("内容","Content")){value->val blocks=vm.layout.a("blocks").objects().map{JSONObject(it.toString())};blocks[index].put("content",value);update(blocks)}
                Row{TextButton(onClick={move(index,-1)}){Text("↑")};TextButton(onClick={move(index,1)}){Text("↓")};TextButton(onClick={val list=vm.layout.a("blocks").objects().map{JSONObject(it.toString())};list[index].put("span",if(block.optInt("span")==2)1 else 2);update(list)}){Text(if(block.optInt("span")==2)vm.t("整宽","Full") else vm.t("半宽","Half"))};TextButton(onClick={val list=vm.layout.a("blocks").objects().map{JSONObject(it.toString())};list[index].put("size",if(block.s("size")=="compact")"expanded" else "compact");update(list)}){Text(vm.t("尺寸","Size"))};IconButton(onClick={update(vm.layout.a("blocks").objects().filterIndexed{i,_->i!=index})}){Icon(Icons.Outlined.Delete,"Remove")}}
            }}
        }
        Text(vm.t("添加组件","Add component"));listOf("intro","gallery","experiences","skills","cities","packages","posts","reviews","social").chunked(3).forEach{row->Row{row.forEach{type->TextButton(onClick={update(vm.layout.a("blocks").objects()+json("id" to UUID.randomUUID().toString(),"type" to type,"span" to 2,"size" to "compact"))}){Text(blockTitle(vm,type))}}}}
        Action(vm.t("保存草稿","Save draft"),!vm.busy){vm.save()};Action(vm.t("发布主页","Publish profile"),!vm.busy){vm.save(true)}
    }
    if(showHistory)AlertDialog(
        onDismissRequest={showHistory=false},
        title={Text(vm.t("主页历史","Profile history"))},
        text={
            Column(Modifier.heightIn(max=360.dp).verticalScroll(rememberScrollState())) {
                if(history.isEmpty())Text(vm.t("暂无历史版本","No published history yet"))
                history.forEach { item ->
                    TextButton(onClick={vm.restoreRevision(item.optInt("revision"));showHistory=false}) {
                        Text(vm.t("恢复版本 ","Restore revision ")+item.optInt("revision"))
                    }
                }
            }
        },
        confirmButton={TextButton(onClick={showHistory=false}){Text(vm.t("关闭","Close"))}}
    )


}

@Composable fun Auth(vm:WorldModel){var email by remember{mutableStateOf("")};var password by remember{mutableStateOf("")};var name by remember{mutableStateOf("")};var token by remember{mutableStateOf("")};var mode by remember{mutableStateOf("login")};Form(vm,vm.t("欢迎来到 Ourworld","Welcome to Ourworld")){
    if(vm.tab==2 && vm.user==null){
        Text(vm.t("示例主页","Example profiles"),style=MaterialTheme.typography.titleLarge)
        Text(vm.t("当地向导","Local guides"),style=MaterialTheme.typography.titleMedium)
        TextButton(onClick={vm.openProfile("demo-guide-paris")}){Text(vm.t("Claire · 巴黎向导示例","Claire · Paris guide demo"))}
        TextButton(onClick={vm.openProfile("demo-guide-tokyo")}){Text(vm.t("Haruka · 东京向导示例","Haruka · Tokyo guide demo"))}
        Text(vm.t("旅行者","Travelers"),style=MaterialTheme.typography.titleMedium)
        TextButton(onClick={vm.openProfile("demo-traveler-lin")}){Text(vm.t("林予 · 旅人示例","Lin · Traveler demo"))}
        TextButton(onClick={vm.openProfile("demo-traveler-anna")}){Text(vm.t("Anna · 旅人示例","Anna · Traveler demo"))}
        HorizontalDivider()
    }
    if(vm.user!=null && vm.user?.optBoolean("verified")!=true){Text(vm.t("打开注册邮箱中的验证链接，完成后继续刚才的操作。","Open the verification email, then continue your previous action."));Action(vm.t("我已完成验证","I have verified my email"),!vm.busy,vm::refreshVerification)}
    Field(email,"Email"){email=it};if(mode!="forgot")Field(password,vm.t("密码","Password"),true){password=it};if(mode=="register")Field(name,vm.t("姓名","Name")){name=it}
    Action(if(mode=="register")vm.t("注册并发送验证邮件","Register & verify") else if(mode=="forgot")vm.t("发送重置邮件","Send reset email") else vm.t("登录","Sign in"),!vm.busy){vm.run{when(mode){"register"->{vm.api.call("/auth/register","POST",json("email" to email,"password" to password,"name" to name));vm.notice=vm.t("请查看验证邮件，本地邮件在 Mailpit 中","Check your verification email in Mailpit");mode="login"};"forgot"->{vm.api.call("/auth/forgot","POST",json("email" to email));vm.notice=vm.t("重置邮件已发送","Reset email sent")};else->vm.signedIn(vm.api.call("/auth/login","POST",json("email" to email,"password" to password)))}}}
    Row{TextButton(onClick={mode=if(mode=="register")"login" else "register"}){Text(vm.t("注册 / 登录","Register / Sign in"))};TextButton(onClick={mode="forgot"}){Text(vm.t("忘记密码","Forgot password"))}}
    if(BuildConfig.DEBUG){
    Text(vm.t("本地调试：邮件操作","Local development: email actions"))
    Field(token,vm.t("邮件验证或重置 token","Email verification or reset token")){token=it}
    TextButton(onClick={vm.run{vm.api.call("/auth/verify","POST",json("token" to token));if(vm.user!=null)vm.refreshVerification();vm.notice=vm.t("邮箱已验证","Email verified")}}){Text(vm.t("验证邮箱","Verify email"))}
    TextButton(onClick={vm.run{vm.api.call("/auth/reset","POST",json("token" to token,"password" to password));vm.notice=vm.t("密码已重置","Password reset")}}){Text(vm.t("设置新密码","Set new password"))}
    }
}}

@Composable fun Settings(vm:WorldModel){
    var name by remember{mutableStateOf(vm.user?.s("name").orEmpty())}
    var bio by remember{mutableStateOf(vm.user?.s("bio").orEmpty())}
    var tags by remember{mutableStateOf(vm.user?.a("tags")?.join(",").orEmpty())}
    var cities by remember{mutableStateOf(vm.user?.a("cityIds")?.join(",").orEmpty())}
    var quote by remember{mutableStateOf(vm.user?.s("quote").orEmpty())}
    val portrait=rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->uri?.let{vm.upload(it,"public"){file->vm.run{vm.user=vm.api.call("/me","PATCH",json("avatar" to file.s("url")))}}}}
    Form(vm,vm.t("设置与个人资料","Settings & details")){
        Picture(vm.user?.s("avatar").orEmpty(),160)
        OutlinedButton(onClick={portrait.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))}){Text(vm.t("更换头像","Change portrait"))}
        Field(name,vm.t("姓名","Name")){name=it}
        Field(bio,vm.t("个人简介","Bio")){bio=it}
        Field(tags,vm.t("特长，逗号分隔","Skills, comma separated")){tags=it}
        Field(quote,vm.t("展示报价","Displayed quote")){quote=it}
        Text(vm.t("选择服务城市","Choose service cities"))
        vm.places.filter{it.s("kind")=="city"}.chunked(2).forEach { pair ->
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) { pair.forEach { place ->
                val selected=cities.split(',').contains(place.s("id"))
                FilterChip(selected=selected,onClick={val ids=cities.split(',').filter{it.isNotBlank()}.toMutableSet();if(selected)ids.remove(place.s("id")) else ids.add(place.s("id"));cities=ids.joinToString(",")},label={Text(place.localized("name",vm.locale))})
            } }
        }
        Action(vm.t("保存资料","Save details")){
            vm.run{vm.user=vm.api.call("/me","PATCH",json("name" to name,"bio" to bio,"tags" to JSONArray(tags.split(',').map{it.trim()}.filter{it.isNotEmpty()}),"cityIds" to JSONArray(cities.split(',').map{it.trim()}.filter{it.isNotEmpty()}),"quote" to quote));vm.notice=vm.t("已保存","Saved")}
        }
        Action(vm.t("切换中英文","Switch language")){vm.language()}
        GlobeCredits(vm)
        OutlinedButton(onClick=vm::logout,modifier=Modifier.fillMaxWidth()){Text(vm.t("退出登录","Sign out"))}
    }
}

@Composable fun GlobeCredits(vm:WorldModel){
    var expanded by remember{mutableStateOf(false)}
    val browser=LocalUriHandler.current
    OutlinedButton(onClick={expanded=!expanded},modifier=Modifier.fillMaxWidth()){
        Text(vm.t("地球影像来源","Earth imagery credits"),Modifier.weight(1f))
        Icon(if(expanded)Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,null)
    }
    if(expanded)Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        TextButton(onClick={browser.openUri(nativeMediaUrl("/api/v1/photo-credits"))}){Text(vm.t("摄影素材与来源","Photography credits"))}
        Text("Earth surface: NASA Earth Observatory / Reto Stöckli. Boundaries: Natural Earth, via world-atlas. NASA does not endorse this app.",style=MaterialTheme.typography.bodySmall)
        Text(vm.t("地表基于2004年7月历史影像统一调色；无云层，不随昼夜变化。","Recolored July 2004 surface imagery. No clouds or day/night changes."),style=MaterialTheme.typography.bodySmall)
        listOf(
            vm.t("日间影像 · NASA","Day imagery · NASA") to "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/"
        ).forEach{(label,url)->TextButton(onClick={browser.openUri(url)}){Text(label);Icon(Icons.Outlined.OpenInNew,null,Modifier.padding(start=8.dp).size(16.dp))}}
    }
}

@Composable fun PackageForm(vm:WorldModel){
    var title by remember{mutableStateOf("")}
    var description by remember{mutableStateOf("")}
    var price by remember{mutableStateOf("")}
    var currency by remember{mutableStateOf("USD")}
    var unit by remember{mutableStateOf("day")}
    var image by remember{mutableStateOf("")}
    var editing by remember{mutableStateOf<String?>(null)}
    var existing by remember{mutableStateOf(listOf<JSONObject>())}
    val photo=rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->uri?.let{vm.upload(it,"public"){file->image=file.s("url")}}}
    LaunchedEffect(Unit){vm.run{existing=vm.api.call("/packages?userId=${vm.user?.s("id")}").a("items").objects()}}
    fun submit(status:String){vm.run{
        vm.api.call(editing?.let{"/packages/$it"}?:"/packages",if(editing==null)"POST" else "PATCH",json("title" to title,"description" to description,"price" to price,"currency" to currency,"unit" to unit,"cityIds" to (vm.user?.a("cityIds")?:JSONArray()),"image" to image,"status" to status))
        existing=vm.api.call("/packages?userId=${vm.user?.s("id")}").a("items").objects();title="";description="";image="";editing=null
    }}
    Form(vm,vm.t("我的服务套餐","My services")){
        Field(title,vm.t("服务名称","Title")){title=it}
        Field(description,vm.t("服务内容","Description")){description=it}
        Field(price,vm.t("报价","Price")){price=it}
        Field(currency,vm.t("币种","Currency")){currency=it}
        Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
            listOf("day" to vm.t("天","Day"),"hour" to vm.t("小时","Hour"),"trip" to vm.t("整次","Trip")).forEach{(key,label)->FilterChip(selected=unit==key,onClick={unit=key},label={Text(label)})}
        }
        Picture(image)
        OutlinedButton(onClick={photo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))}){Text(vm.t("添加套餐图片","Add service photo"))}
        Action(vm.t("保存草稿","Save draft")){submit("draft")}
        Action(vm.t("发布服务","Publish service")){submit("published")}
        existing.forEach { service ->
            Text(service.s("title")+" · "+service.s("status"))
            Row {
                TextButton(onClick={editing=service.s("id");title=service.s("title");description=service.s("description");price=service.s("price");currency=service.s("currency");unit=service.s("unit","day");image=service.s("image")}){Text(vm.t("编辑","Edit"))}
                TextButton(onClick={vm.run{vm.api.call("/packages/${service.s("id")}","PATCH",json("status" to "published"));existing=vm.api.call("/packages?userId=${vm.user?.s("id")}").a("items").objects()}}){Text(vm.t("发布","Publish"))}
                TextButton(onClick={vm.run{vm.api.call("/packages/${service.s("id")}","DELETE");existing=existing.filter{it.s("id")!=service.s("id")}}}){Text(vm.t("下架","Archive"))}
            }
        }
    }
}

@Composable fun VerificationForm(vm:WorldModel){var description by remember{mutableStateOf("")};var kind by remember{mutableStateOf("experience")};var fileIds by remember{mutableStateOf(listOf<String>())};var status by remember{mutableStateOf(JSONObject())};val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->uri?.let{vm.upload(it,"verification"){file->fileIds=fileIds+file.s("id")}}};LaunchedEffect(Unit){vm.run{status=vm.api.call("/verification")}};Form(vm,vm.t("资料认证","Verification")){
    Text(status.s("status")+" "+status.s("reason"));Row{TextButton(onClick={kind="experience"}){Text(vm.t("旅行经历","Experience"))};TextButton(onClick={kind="professional"}){Text(vm.t("专业证件","Professional"))}}
    Text(kind);Field(description,vm.t("经历或资质说明","Experience or credentials")){description=it};OutlinedButton(onClick={picker.launch(arrayOf("image/*","application/pdf"))}){Text(vm.t("上传审核材料","Upload documents"))};Text("${fileIds.size} "+vm.t("份材料","documents"));Action(vm.t("提交审核","Submit for review")){vm.run{status=vm.api.call("/verification","POST",json("kind" to kind,"name" to vm.user?.s("name"),"description" to description,"fileIds" to JSONArray(fileIds)))}}
}}

@Composable fun Community(vm:WorldModel){
    var title by remember{mutableStateOf("")}
    var body by remember{mutableStateOf("")}
    var images by remember{mutableStateOf(listOf<String>())}
    var commentPost by remember{mutableStateOf<JSONObject?>(null)}
    var comments by remember{mutableStateOf(listOf<JSONObject>())}
    var comment by remember{mutableStateOf("")}
    val photo=rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->uri?.let{if(vm.requireLogin())vm.upload(it,"public"){file->images=images+file.s("url")}}}
    Form(vm,vm.t("城市故事","City stories")){
        Field(title,vm.t("标题","Title")){title=it}
        Field(body,vm.t("分享你的经历","Share your story")){body=it}
        images.forEach{Picture(it)}
        OutlinedButton(onClick={photo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))}){Text(vm.t("添加照片","Add photo"))}
        Action(vm.t("发布故事","Publish story")){
            if(vm.requireLogin())vm.run{vm.api.call("/posts","POST",json("cityId" to vm.city?.s("id"),"title" to title,"body" to body,"images" to JSONArray(images)));title="";body="";images=emptyList();vm.posts=vm.api.call("/posts?cityId=${vm.city?.s("id").orEmpty()}").a("items").objects()}
        }
        vm.posts.forEach { post ->
            OutlinedCard {
                Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                    TextButton(onClick={vm.openProfile(post.s("userId"))}){Text(post.o("author").s("name"))}
                    Text(post.s("title"),style=MaterialTheme.typography.titleLarge)
                    Text(post.s("body"))
                    post.a("images").let{photos->(0 until photos.length()).forEach{Picture(photos.optString(it))}}
                    Row {
                        TextButton(onClick={vm.like(post)}){Text("Likes ${post.optInt("likes")}")}
                        TextButton(onClick={commentPost=post;vm.run{comments=vm.api.call("/posts/${post.s("id")}/comments").a("items").objects()}}){Text(vm.t("评论","Comments"))}
                        TextButton(onClick={vm.report("post",post.s("id"),"Story report")}){Text(vm.t("举报","Report"))}
                    }
                }
            }
        }
        commentPost?.let { post ->
            Text(vm.t("评论：","Comments: ")+post.s("title"))
            comments.forEach{Text(it.s("body"))}
            Field(comment,vm.t("写评论","Write a comment")){comment=it}
            Action(vm.t("发送评论","Send comment")){
                if(vm.requireLogin())vm.run{vm.api.call("/posts/${post.s("id")}/comments","POST",json("body" to comment));comment="";comments=vm.api.call("/posts/${post.s("id")}/comments").a("items").objects()}
            }
        }
    }
}
