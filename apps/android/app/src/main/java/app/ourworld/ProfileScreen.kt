package app.ourworld

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

internal fun profileBlockVisible(resource:JSONObject,block:JSONObject):Boolean {
    val user=resource.o("user")
    val refs=block.a("refs").let{a->(0 until a.length()).map{a.optString(it)}}
    return when(block.s("type")){
        "intro"->block.s("content").isNotBlank() || user.s("bio").isNotBlank()
        "experiences"->block.s("content").isNotBlank()
        "gallery"->refs.any{it.isNotBlank()}
        "skills"->user.a("tags").length()>0
        "cities"->user.a("cityIds").length()>0
        "social"->user.a("socialLinks").length()>0
        else->referencedResources(resource.a(block.s("type")).objects(),refs){it.s("id")}.isNotEmpty()
    }
}

@Composable fun TravelPublicProfile(vm:WorldModel){
    val user=vm.profile.o("user")
    var menu by remember{mutableStateOf(false)}
    val cities=vm.profile.a("places").objects().filter{place->user.a("cityIds").let{a->(0 until a.length()).any{a.optString(it)==place.s("id")}}}
    Column(Modifier.fillMaxSize().background(OWVisual.bg)){
        Row(Modifier.fillMaxWidth().heightIn(min=56.dp).padding(horizontal=8.dp),verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick=vm::back){Icon(Icons.Outlined.ArrowBack,vm.t("返回","Back"))}
            Text(vm.t("个人主页","Profile"),fontSize=20.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
            Box{IconButton(onClick={menu=true}){Icon(Icons.Outlined.MoreHoriz,vm.t("更多","More"))};DropdownMenu(expanded=menu,onDismissRequest={menu=false}){DropdownMenuItem(text={Text(vm.t("举报用户","Report person"))},onClick={menu=false;vm.report("user",user.s("id"),"Profile report")})}}
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal=16.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){
            NativePhoto(user.s("avatar"),Modifier.fillMaxWidth().height(340.dp).clip(RoundedCornerShape(24.dp)),user.s("name"))
            Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
                Text(user.s("name"),fontSize=32.sp,fontWeight=FontWeight.SemiBold)
                if(cities.isNotEmpty())Text(cities.joinToString(" · "){it.localized("name",vm.locale)},fontSize=14.sp,color=OWVisual.inkMuted)
                val labels=buildList{
                    if(user.s("id").startsWith("demo-") || user.s("id").startsWith("load-"))add(vm.t("AI 演示人物","AI demo profile"))
                    if(user.optBoolean("verified"))add(vm.t("邮箱已验证","Email verified"))
                    if(user.s("providerStatus")=="approved")add(vm.t("服务资料已审核","Service profile reviewed"))
                }
                Text(labels.joinToString(" · "),fontSize=12.sp,color=OWVisual.inkMuted)
                if(vm.profile.o("layout").a("blocks").objects().none{it.s("type")=="intro"})Text(user.s("bio"),fontSize=16.sp)
            }
            RenderProfile(vm,vm.profile,publicView=true)
            Spacer(Modifier.height(16.dp))
        }
        if(user.s("id")!=vm.user?.s("id"))Surface(color=OWVisual.bg){Button(onClick={vm.connectPerson(user)},enabled=vm.connectingPerson.isEmpty(),shape=RoundedCornerShape(24.dp),modifier=Modifier.fillMaxWidth().padding(16.dp).heightIn(min=52.dp),colors=ButtonDefaults.buttonColors(containerColor=OWVisual.accent,contentColor=OWVisual.bg)){Icon(Icons.Outlined.ChatBubbleOutline,null);Spacer(Modifier.width(8.dp));Text(vm.t("加入对话","Add to chats"))}}
    }
}
