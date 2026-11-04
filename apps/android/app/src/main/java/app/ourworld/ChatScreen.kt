package app.ourworld

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal fun messageSummary(value:String)=value.replace(Regex("^\\[image]\\s*.*"),"图片 / Photo").replace(Regex("^\\[contact]\\s*"),"联系方式 · ").replace(Regex("^\\[place]\\s*"),"地点 · ").replace(Regex("^\\[package]\\s*"),"服务 · ").replace(Regex("^\\[trip]\\s*"),"行程 · ")
private fun localTime(value:String)=runCatching{Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm"))}.getOrDefault("")

@Composable fun TravelConversations(vm:WorldModel){
    Column(Modifier.fillMaxSize().background(OWVisual.bg)){
        Text(vm.t("对话","Conversations"),fontSize=26.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(20.dp))
        if(!vm.online)Text(vm.t("正在重连，消息会自动同步","Reconnecting. Messages will sync."),fontSize=14.sp,color=OWVisual.inkMuted,modifier=Modifier.padding(horizontal=20.dp,vertical=8.dp))
        if(vm.conversations.isEmpty())Column(Modifier.padding(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
            Text(vm.t("从一座城市，认识一个人","Meet someone through a city"),fontSize=22.sp)
            Text(vm.t("在地球上选一座城市，右滑的人会留在这里。","Choose a city on the globe. People you connect with will appear here."),color=OWVisual.inkMuted)
            Action(vm.t("探索地球","Explore the globe")){vm.tab=0;vm.route=""}
        }
        LazyColumn{items(vm.conversations.sortedByDescending{it.s("updatedAt")},key={it.s("id")}){c->
            Surface(onClick={vm.openConversation(c)},color=Color.Transparent){Row(Modifier.fillMaxWidth().padding(horizontal=20.dp,vertical=14.dp),horizontalArrangement=Arrangement.spacedBy(14.dp),verticalAlignment=Alignment.CenterVertically){
                NativePhoto(c.o("peer").s("avatar"),Modifier.size(54.dp).clip(CircleShape),c.o("peer").s("name"))
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(6.dp)){
                    Text(c.o("peer").s("name"),fontSize=16.sp,fontWeight=if(c.optInt("unread")>0)FontWeight.SemiBold else FontWeight.Medium,maxLines=1,overflow=TextOverflow.Ellipsis)
                    Text(messageSummary(c.s("lastMessage").ifEmpty{vm.t("说一句你好","Say hello")}),fontSize=14.sp,color=OWVisual.inkMuted,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
                Column(horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text(localTime(c.s("updatedAt")),fontSize=12.sp,color=OWVisual.inkMuted)
                    if(c.optInt("unread")>0)Badge(containerColor=OWVisual.accent){Text(c.optInt("unread").toString())}
                }
            }}
        }}
    }
}

@OptIn(ExperimentalMaterial3Api::class,ExperimentalFoundationApi::class)
@Composable fun TravelChat(vm:WorldModel){
    val conversation=vm.conversation?:return
    val peer=conversation.o("peer")
    val rows=vm.threadMessages
    val list=rememberLazyListState()
    val scope=rememberCoroutineScope()
    var text by remember(conversation.s("id")){mutableStateOf("")}
    var menu by remember{mutableStateOf(false)}
    var panel by remember{mutableStateOf("")}
    var report by remember{mutableStateOf<JSONObject?>(null)}
    var contactLabel by remember{mutableStateOf("WhatsApp")}
    var contactValue by remember{mutableStateOf("")}
    var title by remember{mutableStateOf("")}
    var date by remember{mutableStateOf("")}
    var nearBottom by remember{mutableStateOf(true)}
    var packages by remember{mutableStateOf(listOf<JSONObject>())}
    var panelError by remember{mutableStateOf("")}
    var panelLoading by remember{mutableStateOf(false)}
    val imagePicker=rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->uri?.let{vm.upload(it,"chat"){file->vm.send(file.s("url"),"image",json("fileId" to file.s("id"),"url" to file.s("url")))}}}
    val city=vm.places.firstOrNull{it.s("id")==conversation.s("cityId")}
    LaunchedEffect(list){snapshotFlow{list.layoutInfo.visibleItemsInfo.lastOrNull()?.index?:0}.collect{last->nearBottom=last>=list.layoutInfo.totalItemsCount-2}}
    LaunchedEffect(rows.lastOrNull()?.s("id")){if(rows.isNotEmpty() && (nearBottom || rows.last().s("senderId")==vm.user?.s("id")))list.animateScrollToItem(rows.size)}
    LaunchedEffect(panel){if(panel=="packages"){panelLoading=true;panelError="";try{packages=vm.api.call("/packages?userId=${vm.user?.s("id")}").a("items").objects().filter{it.s("status")=="published"}}catch(e:Exception){panelError=e.message.orEmpty()}finally{panelLoading=false}}}
    Column(Modifier.fillMaxSize().background(OWVisual.bg).imePadding()){
        Row(Modifier.fillMaxWidth().heightIn(min=64.dp).padding(horizontal=8.dp),verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick={vm.route=""}){Icon(Icons.Outlined.ArrowBack,vm.t("返回","Back"))}
            Surface(onClick={vm.openProfile(peer.s("id"))},color=Color.Transparent,modifier=Modifier.weight(1f)){
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                    NativePhoto(peer.s("avatar"),Modifier.size(40.dp).clip(CircleShape),peer.s("name"))
                    Column{Text(peer.s("name"),fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis);if(city!=null)Text(vm.t("在${city.localized("name",vm.locale)}认识","Connected in ${city.localized("name",vm.locale)}"),fontSize=12.sp,color=OWVisual.inkMuted)}
                }
            }
            Box{IconButton(onClick={menu=true}){Icon(Icons.Outlined.MoreHoriz,vm.t("更多","More"))};DropdownMenu(expanded=menu,onDismissRequest={menu=false}){
                DropdownMenuItem(text={Text(vm.t("查看主页","View profile"))},onClick={menu=false;vm.openProfile(peer.s("id"))})
                DropdownMenuItem(text={Text(vm.t("举报用户","Report person"))},onClick={menu=false;report=json("type" to "user","id" to peer.s("id"))})
                DropdownMenuItem(text={Text(vm.t("拉黑用户","Block person"),color=OWVisual.nope)},onClick={menu=false;panel="block"})
            }}
        }
        Box(Modifier.weight(1f)){
            LazyColumn(state=list,modifier=Modifier.fillMaxSize(),contentPadding=PaddingValues(horizontal=16.dp,vertical=12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                item(key="start"){
                    if(vm.hasOlderMessages)TextButton(onClick=vm::history,enabled=!vm.historyLoading){Text(vm.t("更早的消息","Earlier messages"))}
                    if(vm.messagesLoading && rows.isEmpty())CircularProgressIndicator(Modifier.size(24.dp))
                    if(!vm.messagesLoading && rows.isEmpty())Column(Modifier.fillMaxWidth().padding(top=32.dp,bottom=24.dp),verticalArrangement=Arrangement.spacedBy(16.dp),horizontalAlignment=Alignment.CenterHorizontally){
                        NativePhoto(peer.s("avatar"),Modifier.size(80.dp).clip(CircleShape),peer.s("name"))
                        Text(vm.t("和 ${peer.s("name")} 聊聊这座城市","Discover the city with ${peer.s("name")}"),fontSize=22.sp,fontWeight=FontWeight.SemiBold)
                        Text(peer.s("bio"),color=OWVisual.inkMuted,fontSize=14.sp,maxLines=3,overflow=TextOverflow.Ellipsis)
                        listOf(vm.t("有什么值得散步的街区？","Which neighbourhood is great for a walk?"),vm.t("第一次来，你推荐从哪里开始？","Where would you recommend starting on a first visit?")).forEach{prompt->OutlinedButton(onClick={text=prompt},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text(prompt)}}
                    }
                }
                items(rows,key={it.s("id")}){m->
                    val mine=m.s("senderId")==vm.user?.s("id")
                    Column(Modifier.fillMaxWidth(),horizontalAlignment=if(mine)Alignment.End else Alignment.Start){
                        Surface(color=if(mine)OWVisual.ink else Color.White,shape=RoundedCornerShape(20.dp),modifier=Modifier.widthIn(max=310.dp).combinedClickable(onClick={},onLongClick={report=json("type" to "message","id" to m.s("id"))})){
                            Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                                val color=if(mine)Color.White else OWVisual.ink
                                when(m.s("type")){
                                    "image"->NativePhoto(m.o("data").s("url",m.s("body")),Modifier.width(240.dp).height(220.dp).clip(RoundedCornerShape(12.dp)),vm.t("聊天图片","Chat photo"))
                                    "contact"->{Text(m.o("data").s("label",vm.t("联系方式","Contact")),color=color,fontWeight=FontWeight.SemiBold);Text(m.o("data").s("value",m.s("body")),color=color)}
                                    "trip"->TextButton(onClick={panel="trips"}){Icon(Icons.Outlined.CalendarMonth,null,tint=color);Spacer(Modifier.width(8.dp));Text(m.s("body"),color=color)}
                                    "place","package"->{Text(if(m.s("type")=="place")vm.t("分享地点","Shared place") else vm.t("服务体验","Experience"),color=color.copy(alpha=.8f),fontSize=12.sp);Text(m.s("body"),color=color,fontSize=16.sp)}
                                    else->Text(m.s("body"),color=color,fontSize=16.sp)
                                }
                                Row(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
                                    Text(localTime(m.s("createdAt")),fontSize=12.sp,color=color.copy(alpha=.75f))
                                    if(mine)when(m.s("delivery")){
                                        "sending"->Text(vm.t("发送中","Sending"),fontSize=12.sp,color=color.copy(alpha=.8f))
                                        "failed"->TextButton(onClick={vm.retryMessage(m)}){Text(vm.t("重试","Retry"),color=color,fontSize=12.sp)}
                                        else->Icon(if(m.optInt("sequence")<=vm.peerReadSequence)Icons.Outlined.DoneAll else Icons.Outlined.Check,if(m.optInt("sequence")<=vm.peerReadSequence)vm.t("已读","Read") else vm.t("已发送","Sent"),Modifier.size(14.dp),tint=color.copy(alpha=.8f))
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if(!nearBottom && rows.isNotEmpty())FilledTonalButton(onClick={scope.launch{list.animateScrollToItem(rows.size)}},modifier=Modifier.align(Alignment.BottomCenter)){Text(vm.t("最新消息","Latest messages"))}
        }
        if(vm.messageError.isNotBlank())TextButton(onClick={scope.launch{try{vm.loadMessages();vm.messageError=""}catch(_:Exception){}}}){Text(vm.t("消息载入失败，点击重试","Couldn't load messages. Tap to retry."))}
        Row(Modifier.fillMaxWidth().padding(horizontal=8.dp,vertical=10.dp),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(4.dp)){
            IconButton(onClick={panel="attachments"},modifier=Modifier.size(48.dp)){Icon(Icons.Outlined.Add,vm.t("添加附件","Add attachment"))}
            OutlinedTextField(value=text,onValueChange={text=it},modifier=Modifier.weight(1f).heightIn(min=48.dp,max=140.dp),placeholder={Text(vm.t("写一条消息…","Write a message…"))},maxLines=4,shape=RoundedCornerShape(24.dp))
            FilledIconButton(onClick={if(text.isNotBlank()){vm.send(text.trim());text=""}},enabled=text.isNotBlank(),modifier=Modifier.size(48.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=OWVisual.accent)){Icon(Icons.Outlined.Send,vm.t("发送","Send"),tint=Color.White)}
        }
    }
    if(report!=null)AlertDialog(onDismissRequest={report=null},title={Text(vm.t("举报此内容？","Report this content?"))},text={Text(vm.t("提交后由审核人员处理。","A moderator will review the report."))},confirmButton={TextButton(onClick={report?.let{vm.report(it.s("type"),it.s("id"),"Reported from conversation")};report=null}){Text(vm.t("提交举报","Report"))}},dismissButton={TextButton(onClick={report=null}){Text(vm.t("取消","Cancel"))}})
    if(panel=="block")AlertDialog(onDismissRequest={panel=""},title={Text(vm.t("拉黑 ${peer.s("name")}？","Block ${peer.s("name")}?"))},text={Text(vm.t("对方将不能继续给你发消息。","This person will no longer be able to message you."))},confirmButton={TextButton(onClick={panel="";vm.block(peer.s("id"))}){Text(vm.t("拉黑","Block"))}},dismissButton={TextButton(onClick={panel=""}){Text(vm.t("取消","Cancel"))}})
    else if(panel.isNotEmpty())ModalBottomSheet(onDismissRequest={panel=""},containerColor=OWVisual.bg){
        LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
            when(panel){
                "attachments"->item{Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
                    Text(vm.t("分享旅途中的事","Share something from your journey"),fontSize=22.sp,fontWeight=FontWeight.SemiBold)
                    Action(vm.t("图片","Photo")){panel="";imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))}
                    listOf("contact" to vm.t("联系方式","Contact details"),"places" to vm.t("地点","Place"),"packages" to vm.t("我的服务","My experiences"),"trips" to vm.t("行程与评价","Trips & reviews")).forEach{(key,label)->OutlinedButton(onClick={panel=key},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text(label)}}
                }}
                "contact"->item{Column(verticalArrangement=Arrangement.spacedBy(14.dp)){Text(vm.t("分享联系方式","Share contact details"),fontSize=22.sp);Field(contactLabel,vm.t("类型","Type")){contactLabel=it};Field(contactValue,vm.t("账号或号码","Handle or number")){contactValue=it};Action(vm.t("发送到当前对话","Send to this chat"),contactValue.isNotBlank()){vm.send(contactValue,"contact",json("label" to contactLabel,"value" to contactValue));contactValue="";panel=""}}}
                "places"->{item{Text(vm.t("分享地点","Share a place"),fontSize=22.sp)};items(vm.places.filter{it.s("kind")!="country"},key={it.s("id")}){place->TextButton(onClick={vm.send(place.localized("name",vm.locale),"place",json("placeId" to place.s("id")));panel=""},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text(place.localized("name",vm.locale))}}}
                "packages"->{item{Text(vm.t("分享服务","Share an experience"),fontSize=22.sp);if(panelLoading)CircularProgressIndicator(Modifier.size(24.dp));if(panelError.isNotBlank())Text(panelError);if(!panelLoading && packages.isEmpty())Text(vm.t("你还没有已发布的服务。","You have no published experiences."))};items(packages,key={it.s("id")}){p->TextButton(onClick={vm.send(p.s("title"),"package",json("packageId" to p.s("id")));panel=""}){Text(p.s("title"))}}}
                "trips"->{item{Text(vm.t("行程与评价","Trips & reviews"),fontSize=22.sp)};items(vm.trips,key={it.s("id")}){TripCard(vm,it)};item{Column(verticalArrangement=Arrangement.spacedBy(12.dp)){Field(title,vm.t("行程名称","Trip title")){title=it};EndDateField(vm,date){date=it};Action(vm.t("发送行程邀请","Send trip invitation"),title.isNotBlank() && date.isNotBlank()){vm.createTrip(title,date);title="";date=""}}}}
            }
            item{Spacer(Modifier.height(24.dp))}
        }
    }
}
