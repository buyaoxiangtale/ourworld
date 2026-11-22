@file:OptIn(ExperimentalLayoutApi::class)
package app.ourworld

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

internal fun profileBlockVisible(resource:JSONObject,block:JSONObject):Boolean {
    val user=resource.o("user")
    val refs=block.a("refs").let{a->(0 until a.length()).map{a.optString(it)}}
    return when(block.s("type")){
        "intro"->block.s("content").isNotBlank() || user.s("bio").isNotBlank()
        "prompts"->block.a("prompts").objects().any{it.s("answer").isNotBlank()}
        "experiences"->block.s("content").isNotBlank()
        "gallery"->refs.any{it.isNotBlank()}
        "skills"->user.a("tags").length()>0
        "cities"->user.a("cityIds").length()>0
        "social"->user.a("socialLinks").length()>0
        else->referencedResources(resource.a(block.s("type")).objects(),refs){it.s("id")}.isNotEmpty()
    }
}

internal data class ProfileChip(val label:String,val value:String?,val critical:Boolean=false,val onFill:()->Unit={})

internal fun priceRangeText(vm:WorldModel,range:JSONObject):String {
    val unit=when(range.s("unit")){"hour"->vm.t("小时","hour");"half-day"->vm.t("半日","half-day");"experience"->vm.t("次","experience");else->vm.t("天","day")}
    return "${range.s("currency")} ${range.d("min").trim0()}–${range.d("max").trim0()} / $unit"
}

private fun Modifier.dashedAccentEdge():Modifier=drawBehind{
    drawRoundRect(color=OWVisual.accent.copy(alpha=.75f),cornerRadius=CornerRadius(12.dp.toPx(),12.dp.toPx()),style=Stroke(width=1.5.dp.toPx(),pathEffect=PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(),5.dp.toPx()))))
}

@Composable fun TravelPublicProfile(vm:WorldModel){
    val user=vm.profile.o("user")
    val owner=false // This route is the visitor preview; editing lives in NativeOwnerProfile.
    var menu by remember{mutableStateOf(false)}
    var bannerDismissed by remember(user.s("id")){mutableStateOf(false)}
    val blocks=vm.profile.o("layout").a("blocks").objects()
    val cities=vm.profile.a("places").objects().filter{place->user.a("cityIds").let{a->(0 until a.length()).any{a.optString(it)==place.s("id")}}}
    val languages=user.a("languages").let{a->(0 until a.length()).map{a.optString(it)}}
    val tags=user.a("tags").let{a->(0 until a.length()).map{a.optString(it)}}
    val galleryPhotos=blocks.filter{it.s("type")=="gallery"}.flatMap{b->b.a("refs").let{a->(0 until a.length()).map{a.optString(it)}}}.filter{it.isNotBlank()}
    val photos=if(galleryPhotos.isNotEmpty())galleryPhotos else vm.profile.a("posts").objects().flatMap{p->p.a("images").let{a->(0 until a.length()).map{a.optString(it)}}}.filter{it.isNotBlank()}
    val promptBlocks=blocks.filter{it.s("type")=="prompts"}
    val promptAnswers=promptBlocks.flatMap{b->b.a("prompts").objects()}.filter{it.s("answer").isNotBlank()}
    val hasPrice=!user.isNull("priceRange")
    val completeness=(if(hasPrice)30 else 0)+(if(galleryPhotos.size>=3)30 else 0)+(if(promptAnswers.isNotEmpty())25 else 0)+(if(user.s("bio").isNotBlank())15 else 0)
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
                ProfileBadges(vm,user)
                val meta=buildList{
                    if(!user.isNull("rating"))add("★ ${user.d("rating").trim0()}")
                    if(!user.isNull("experienceYears"))add(vm.t("${user.d("experienceYears").toInt()} 年经验","${user.d("experienceYears").toInt()} yrs"))
                    if(languages.isNotEmpty())add(languages.take(3).joinToString(" / "))
                }.filter{it.isNotBlank()}.joinToString(" · ")
                if(meta.isNotEmpty())Text(meta,fontSize=14.sp,color=OWVisual.inkMuted)
                if(hasPrice)Text(priceRangeText(vm,user.o("priceRange")),fontSize=16.sp,fontWeight=FontWeight.SemiBold,color=OWVisual.accent)
                else Text(if(owner)vm.t("价格待定 · 补充报价","Price not set · Add pricing") else vm.t("价格待定","Price not set"),fontSize=14.sp,color=OWVisual.inkFaint,modifier=if(owner)Modifier.clickable{vm.editProfileCard("gallery")} else Modifier)
                if(blocks.none{it.s("type")=="intro"})Text(user.s("bio"),fontSize=16.sp)
            }
            if(owner && completeness<100 && !bannerDismissed)ProfileCompletenessBanner(vm,completeness,hasPrice,galleryPhotos.size>=3,promptAnswers.isNotEmpty()){bannerDismissed=true}
            ProfileChipRow(listOf(
                ProfileChip(vm.t("服务城市","Service cities"),cities.joinToString(" · "){it.localized("name",vm.locale)}.ifEmpty{null},false){vm.route="settings"},
                ProfileChip(vm.t("从业年限","Experience"),if(!user.isNull("experienceYears"))vm.t("${user.d("experienceYears").toInt()} 年","${user.d("experienceYears").toInt()} yrs") else null,false){vm.route="settings"},
                ProfileChip(vm.t("语言","Languages"),languages.joinToString(" / ").ifEmpty{null},false){vm.editProfileCard("gallery")},
                ProfileChip(vm.t("报价区间","Price range"),if(hasPrice)priceRangeText(vm,user.o("priceRange")) else null,true){vm.editProfileCard("gallery")},
                ProfileChip(vm.t("学校与学历","School & education"),educationText(vm,user).ifBlank{null},false){vm.route="settings"},
                ProfileChip(vm.t("专长","Skills"),tags.joinToString(" · ").ifEmpty{null},false){vm.route="settings"}
            ),owner)
            if(photos.isNotEmpty() || owner)ProfilePhotoStrip(vm,owner,photos)
            if(promptBlocks.isNotEmpty())ProfilePrompts(vm,owner,promptBlocks)
            if(tags.isNotEmpty() || owner)ProfileInterests(vm,owner,tags)
            RenderProfile(vm,vm.profile,publicView=true,hide=setOf("gallery","skills","prompts","cities"))
            Spacer(Modifier.height(16.dp))
        }
        if(user.s("id")!=vm.user?.s("id"))Surface(color=OWVisual.bg){Button(onClick={vm.connectPerson(user)},enabled=vm.connectingPerson.isEmpty(),shape=RoundedCornerShape(24.dp),modifier=Modifier.fillMaxWidth().padding(16.dp).heightIn(min=52.dp),colors=ButtonDefaults.buttonColors(containerColor=OWVisual.accent,contentColor=OWVisual.accentInk)){Icon(Icons.Outlined.ChatBubbleOutline,null);Spacer(Modifier.width(8.dp));Text(vm.t("加入对话","Add to chats"))}}
    }
}

@Composable fun ProfileBadges(vm:WorldModel,user:JSONObject){
    val badges=buildList{
        if(user.s("id").startsWith("demo-") || user.s("id").startsWith("load-"))add(Triple(Icons.Outlined.SmartToy,vm.t("AI 演示人物","AI demo profile"),OWVisual.inkMuted))
        if(user.optBoolean("verified"))add(Triple(Icons.Outlined.Verified,vm.t("邮箱已验证","Email verified"),OWVisual.inkMuted))
        if(user.s("accountType")=="agency")add(if(user.s("providerStatus")=="approved")Triple(Icons.Outlined.EmojiEvents,vm.t("认证旅行社","Certified agency"),OWVisual.focus) else Triple(Icons.Outlined.HourglassEmpty,vm.t("旅行社认证审核中","Agency certification pending"),OWVisual.focus))
        else if(user.s("providerStatus")=="approved")add(Triple(Icons.Outlined.Check,vm.t("个人导游","Personal guide"),OWVisual.accent))
    }
    if(badges.isEmpty())return
    FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        badges.forEach{(icon,label,tint)->
            Surface(color=tint.copy(alpha=.14f),shape=RoundedCornerShape(999.dp)){Row(Modifier.padding(horizontal=10.dp,vertical=5.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)){Icon(icon,null,Modifier.size(13.dp),tint=tint);Text(label,fontSize=11.sp,fontWeight=FontWeight.Medium,color=tint)}}
        }
    }
}

@Composable fun ProfileCompletenessBanner(vm:WorldModel,percent:Int,priceDone:Boolean,photosDone:Boolean,promptsDone:Boolean,onDismiss:()->Unit){
    Surface(color=OWVisual.raised,shape=RoundedCornerShape(16.dp)){
        Column(Modifier.fillMaxWidth().padding(start=16.dp,top=14.dp,bottom=14.dp,end=8.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            Row(verticalAlignment=Alignment.CenterVertically){
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(2.dp)){
                    Text(vm.t("完善你的主页","Complete your profile"),fontSize=15.sp,fontWeight=FontWeight.SemiBold,color=OWVisual.ink)
                    Text("$percent%",fontSize=12.sp,fontWeight=FontWeight.Medium,color=OWVisual.accent)
                }
                IconButton(onClick=onDismiss){Icon(Icons.Outlined.Close,vm.t("关闭","Dismiss"),Modifier.size(18.dp),tint=OWVisual.inkMuted)}
            }
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                if(!priceDone)ProfileHintPill(vm.t("未填报价","Add your pricing"))
                if(!photosDone)ProfileHintPill(vm.t("照片少于 3 张","Fewer than 3 photos"))
                if(!promptsDone)ProfileHintPill(vm.t("无旅行问答","No travel prompts"))
            }
        }
    }
}

@Composable fun ProfileHintPill(label:String){
    Surface(color=OWVisual.nope.copy(alpha=.12f),shape=RoundedCornerShape(999.dp)){Row(Modifier.padding(horizontal=10.dp,vertical=5.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(5.dp)){Box(Modifier.size(6.dp).clip(CircleShape).background(OWVisual.nope));Text(label,fontSize=11.sp,color=OWVisual.inkMuted)}}
}

@Composable private fun ProfileChipRow(chips:List<ProfileChip>, owner:Boolean){
    FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
        chips.forEach{chip->
            val value=chip.value
            if(value!=null)Surface(color=OWVisual.surface,shape=RoundedCornerShape(12.dp)){Column(Modifier.padding(horizontal=12.dp,vertical=8.dp),verticalArrangement=Arrangement.spacedBy(2.dp)){Text(chip.label,fontSize=11.sp,color=OWVisual.inkFaint);Text(value,fontSize=13.sp,fontWeight=FontWeight.Medium,color=OWVisual.ink)}}
            else if(owner)Surface(onClick=chip.onFill,shape=RoundedCornerShape(12.dp),color=Color.Transparent,modifier=Modifier.dashedAccentEdge()){Row(Modifier.padding(horizontal=12.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){Text(chip.label,fontSize=11.sp,color=OWVisual.inkFaint);if(chip.critical)Box(Modifier.size(6.dp).clip(CircleShape).background(OWVisual.nope));Icon(Icons.Outlined.Add,null,Modifier.size(14.dp),tint=OWVisual.accent)}}
        }
    }
}

@Composable fun ProfilePhotoStrip(vm:WorldModel,owner:Boolean,photos:List<String>){
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
            Text(if(owner)vm.t("我的照片","My photos") else vm.t("照片","Photos"),style=MaterialTheme.typography.titleMedium,modifier=Modifier.weight(1f))
            if(owner)Surface(onClick={vm.editProfileCard("gallery")},color=OWVisual.space,shape=RoundedCornerShape(999.dp)){Row(Modifier.padding(horizontal=14.dp,vertical=7.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){Icon(Icons.Outlined.Edit,null,Modifier.size(14.dp),tint=OWVisual.inkMuted);Text(vm.t("编辑","Edit"),fontSize=12.sp,color=OWVisual.ink)}}
        }
        LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){
            items(photos){photo->NativePhoto(photo,Modifier.width(220.dp).height(160.dp).clip(RoundedCornerShape(16.dp)),vm.t("照片","Photo"))}
            if(owner && photos.isEmpty())item{Surface(onClick={vm.editProfileCard("gallery")},color=Color.Transparent,shape=RoundedCornerShape(16.dp),modifier=Modifier.size(160.dp).dashedAccentEdge()){Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(6.dp)){Icon(Icons.Outlined.Add,null,Modifier.size(22.dp),tint=OWVisual.accent);Text(vm.t("添加照片","Add photo"),fontSize=12.sp,color=OWVisual.inkMuted)}}}}
        }
        if(owner)Text("Pro tip · "+vm.t("照片多样一些：街头、作品、日常","Vary them: street scenes, craft, everyday moments"),fontSize=12.sp,color=OWVisual.inkMuted)
    }
}

@Composable fun ProfilePrompts(vm:WorldModel,owner:Boolean,blocks:List<JSONObject>){
    val answers=blocks.flatMap{b->b.a("prompts").objects()}.filter{it.s("answer").isNotBlank()}
    if(!owner && answers.isEmpty())return
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text(blocks.firstOrNull()?.s("title")?.ifEmpty{vm.t("旅行问答","Travel prompts")}?:vm.t("旅行问答","Travel prompts"),style=MaterialTheme.typography.titleMedium)
        if(answers.isEmpty())Surface(onClick={vm.editProfileCard("prompts")},color=Color.Transparent,shape=RoundedCornerShape(16.dp),modifier=Modifier.fillMaxWidth().dashedAccentEdge()){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Text(vm.t("回答旅行问答，让旅行者更了解你","Answer travel prompts so travellers get to know you"),fontSize=13.sp,color=OWVisual.inkMuted);Text(vm.t("我城市里最值得早起的地方是…","The place in my city most worth waking up early for…"),fontSize=15.sp,color=OWVisual.inkFaint);Text(vm.t("旅行者最好奇我当地的…","What travellers are most curious about where I live…"),fontSize=15.sp,color=OWVisual.inkFaint)}}
        else answers.forEach{p->Surface(color=OWVisual.raised,shape=RoundedCornerShape(16.dp)){Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){Text(p.s("question"),fontSize=13.sp,fontWeight=FontWeight.SemiBold,color=OWVisual.accent);Text(p.s("answer"),fontSize=15.sp,color=OWVisual.ink)}}}
    }
}

@Composable fun ProfileInterests(vm:WorldModel,owner:Boolean,tags:List<String>){
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text(vm.t("兴趣与特长","Interests"),style=MaterialTheme.typography.titleMedium)
        val tiles=mutableListOf<String?>().apply{addAll(tags);if(owner)add(null)}
        tiles.chunked(2).forEach{row->
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
                row.forEach{tag->
                    if(tag==null)Surface(onClick={vm.route="settings"},color=Color.Transparent,shape=RoundedCornerShape(16.dp),modifier=Modifier.weight(1f).dashedAccentEdge()){Row(Modifier.padding(horizontal=16.dp,vertical=14.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){Icon(Icons.Outlined.Add,null,Modifier.size(18.dp),tint=OWVisual.accent);Text(vm.t("添加兴趣","Add interest"),fontSize=15.sp,color=OWVisual.inkMuted)}}
                    else Surface(color=OWVisual.raised,shape=RoundedCornerShape(16.dp),modifier=Modifier.weight(1f)){Text(tag,Modifier.padding(horizontal=16.dp,vertical=14.dp),fontSize=15.sp,fontWeight=FontWeight.Medium,color=OWVisual.ink)}
                }
                if(row.size==1)Spacer(Modifier.weight(1f))
            }
        }
    }
}
