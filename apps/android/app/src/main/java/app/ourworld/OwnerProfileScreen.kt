@file:OptIn(ExperimentalLayoutApi::class)
package app.ourworld

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Editing overview; published block ordering remains available through Preview. */
@Composable fun NativeOwnerProfile(vm:WorldModel){
    val resource=vm.profile;val user=resource.o("user")
    val blocks=resource.o("layout").a("blocks").objects()
    val photos=(blocks.filter{it.s("type")=="gallery"}.flatMap{b->b.a("refs").let{a->(0 until a.length()).map{a.optString(it)}}}+resource.a("posts").objects().flatMap{p->p.a("images").let{a->(0 until a.length()).map{a.optString(it)}}}).filter{it.isNotBlank()}.distinct()
    val prompts=blocks.filter{it.s("type")=="prompts"}.flatMap{it.a("prompts").objects()}.filter{it.s("answer").isNotBlank()}
    val tags=user.a("tags").let{a->(0 until a.length()).map{a.optString(it)}}
    val cities=resource.a("places").objects().filter{p->user.a("cityIds").let{a->(0 until a.length()).any{a.optString(it)==p.s("id")}}}.joinToString(" / "){it.localized("name",vm.locale)}
    val hasPrice=!user.isNull("priceRange")
    Box(Modifier.fillMaxSize().background(OWVisual.bg)){
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=16.dp).padding(top=20.dp,bottom=24.dp),verticalArrangement=Arrangement.spacedBy(22.dp)){
            Row(Modifier.fillMaxWidth().padding(top=38.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)){
                Surface(onClick={vm.openProfile(user.s("id"))},shape=RoundedCornerShape(14.dp),color=OWVisual.surface){NativePhoto(user.s("avatar"),Modifier.width(70.dp).height(88.dp),user.s("name"))}
                Column(Modifier.weight(1f)){
                    Text(vm.t("我的主页","My profile"),fontSize=11.sp,color=OWVisual.inkMuted)
                    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)){
                        Text(user.s("name"),fontSize=28.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f,false))
                        if(user.optBoolean("verified"))Icon(Icons.Outlined.Verified,vm.t("邮箱已验证","Email verified"),Modifier.size(21.dp),tint=OWVisual.accent)
                    }
                    TextButton(onClick={vm.openProfile(user.s("id"))},contentPadding=PaddingValues(0.dp)){Text(vm.t("预览","Preview"),color=OWVisual.inkMuted);Spacer(Modifier.width(6.dp));Icon(Icons.Outlined.ChevronRight,null,Modifier.size(16.dp),tint=OWVisual.inkMuted)}
                }
            }
            if(user.s("accountType")=="agency")ProfileBadges(vm,user)
            if(!hasPrice||photos.size<3||prompts.size<2||user.s("bio").isBlank())Surface(onClick={vm.route="settings"},color=OWVisual.surface,shape=CircleShape){Row(Modifier.fillMaxWidth().padding(horizontal=14.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){Icon(Icons.Outlined.ErrorOutline,null,Modifier.size(19.dp),tint=OWVisual.nope);Text(vm.t("请将您的个人资料填写完整","Complete your personal profile"),fontSize=14.sp,fontWeight=FontWeight.Medium,modifier=Modifier.weight(1f));Icon(Icons.Outlined.ChevronRight,null,Modifier.size(16.dp))}}
            FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                val chips=listOf(cities.ifEmpty{vm.t("服务城市","Cities")},if(user.isNull("experienceYears"))vm.t("从业年限 +","Experience +") else vm.t("${user.d("experienceYears").toInt()} 年","${user.d("experienceYears").toInt()} yrs"),user.a("languages").let{a->(0 until a.length()).map{a.optString(it)}}.joinToString(" / ").ifEmpty{vm.t("语言 +","Languages +")},if(hasPrice)priceRangeText(vm,user.o("priceRange")) else vm.t("报价区间 +","Rates +"),tags.take(3).joinToString(" / ").ifEmpty{vm.t("专长 +","Skills +")})
                chips.forEachIndexed{index,label->Surface(onClick={vm.route=if(index==0)"profile-cities" else "settings"},color=OWVisual.raised,shape=CircleShape){Text(label,Modifier.padding(horizontal=12.dp,vertical=10.dp),fontSize=12.sp,color=OWVisual.inkMuted)}}
            }
            Surface(onClick={vm.route="settings"},color=OWVisual.raised,shape=CircleShape){Row(Modifier.padding(horizontal=12.dp,vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){Icon(Icons.Outlined.School,null,Modifier.size(16.dp),tint=OWVisual.inkMuted);Text(educationText(vm,user).ifBlank{vm.t("学校与学历 +","School & education +")},fontSize=12.sp,color=OWVisual.inkMuted)}}
            Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
                OwnerSectionTitle(vm.t("我的照片","My photos"),if(photos.size<3)vm.t("再添加 ${3-photos.size} 张照片","Add ${3-photos.size} more photos") else "")
                Surface(color=OWVisual.surface,shape=RoundedCornerShape(26.dp)){
                    Column(Modifier.padding(8.dp)){
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(19.dp)),horizontalArrangement=Arrangement.spacedBy(1.dp)){
                            repeat(6){i->Surface(onClick={vm.editProfileCard("gallery")},color=OWVisual.raised,modifier=Modifier.weight(1f).height(84.dp)){
                                Box(contentAlignment=Alignment.Center){if(i<photos.size)NativePhoto(photos[i],Modifier.fillMaxSize(),vm.t("我的照片 ${i+1}","My photo ${i+1}")) else Icon(Icons.Outlined.Add,vm.t("添加照片","Add photo"));if(i==5&&photos.size>6)Surface(color=OWVisual.space.copy(alpha=.7f)){Text("+${photos.size-6}",Modifier.padding(5.dp),color=OWVisual.ink)}}
                            }}
                        }
                        Row(Modifier.fillMaxWidth().padding(top=12.dp,start=8.dp,bottom=4.dp,end=4.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){Text(vm.t("用照片分享街头、旅途与日常。","Share your journeys and everyday life."),fontSize=12.sp,color=OWVisual.inkMuted,modifier=Modifier.weight(1f));Button(onClick={vm.editProfileCard("gallery")},colors=ButtonDefaults.buttonColors(containerColor=OWVisual.space,contentColor=OWVisual.ink)){Text(vm.t("编辑","Edit"))}}
                    }
                }
            }
            Column(verticalArrangement=Arrangement.spacedBy(14.dp)){
                OwnerSectionTitle(vm.t("我的“关于我”","My prompts"),if(prompts.size<2)vm.t("再添加 ${2-prompts.size} 条旅行问答","Add ${2-prompts.size} more travel prompts") else "")
                val cards=mutableListOf(Triple(vm.t("关于我","About me"),user.s("bio"),false))
                cards.addAll(prompts.map{Triple(it.s("question"),it.s("answer"),true)})
                repeat(maxOf(0,2-prompts.size)){cards.add(Triple(vm.t("回答提示","Answer a prompt"),"",true))}
                cards.chunked(2).forEach{row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){row.forEach{(title,answer,prompt)->OwnerTile(title,answer.ifBlank{vm.t("写一点关于你的故事","Share a little of your story")},Icons.Outlined.FormatQuote,answer.isNotBlank(),Modifier.weight(1f)){if(prompt)vm.editProfileCard("prompts") else vm.route="settings"}};if(row.size==1)Spacer(Modifier.weight(1f))}}
            }
            Column(verticalArrangement=Arrangement.spacedBy(14.dp)){
                OwnerSectionTitle(vm.t("我的兴趣","My interests"),"")
                val icons=listOf(Icons.Outlined.Explore,Icons.Outlined.CameraAlt,Icons.Outlined.LocalCafe,Icons.Outlined.MusicNote,Icons.Outlined.Landscape,Icons.Outlined.FavoriteBorder)
                (tags+vm.t("当前爱好","Current favourites")).chunked(2).forEachIndexed{rowIndex,row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){row.forEachIndexed{column,tag->OwnerTile(tag,if(rowIndex*2+column<tags.size)vm.t("我的兴趣","Something I love") else vm.t("选择兴趣","Add your interests"),icons[(rowIndex*2+column)%icons.size],false,Modifier.weight(1f)){vm.route="settings"}};if(row.size==1)Spacer(Modifier.weight(1f))}}
            }
            Surface(onClick={vm.route="settings"},color=OWVisual.surface,shape=CircleShape){Row(Modifier.fillMaxWidth().padding(14.dp),verticalAlignment=Alignment.CenterVertically){Text(vm.t("更多个人资料管理项","More profile details"),Modifier.weight(1f),fontSize=14.sp);Icon(Icons.Outlined.ChevronRight,null)}}
            listOf(Triple(vm.t("我的服务套餐","My experiences"),"packages",Icons.Outlined.GridView),Triple(vm.t("身份与服务审核","Identity & service review"),"verification",Icons.Outlined.VerifiedUser)).forEach{(title,route,icon)->TextButton(onClick={vm.route=route},modifier=Modifier.fillMaxWidth()){Icon(icon,null,Modifier.size(19.dp));Spacer(Modifier.width(10.dp));Text(title,Modifier.weight(1f));Icon(Icons.Outlined.ChevronRight,null)}}
        }
        Row(Modifier.align(Alignment.TopEnd).padding(top=12.dp,end=16.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
            Surface(onClick={vm.route="settings"},color=OWVisual.bg,shape=CircleShape){Box(Modifier.size(44.dp),contentAlignment=Alignment.Center){Icon(Icons.Outlined.Edit,vm.t("编辑个人资料","Edit personal details"),Modifier.size(21.dp))}}
            Surface(onClick={vm.route="settings"},color=OWVisual.bg,shape=CircleShape){Box(Modifier.size(44.dp),contentAlignment=Alignment.Center){Icon(Icons.Outlined.Settings,vm.t("设置","Settings"),Modifier.size(22.dp))}}
        }
    }
}

@Composable private fun OwnerSectionTitle(title:String,hint:String){Column(Modifier.padding(horizontal=10.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){Text(title,fontSize=20.sp,fontWeight=FontWeight.SemiBold);if(hint.isNotEmpty())Text(hint,fontSize=13.sp,color=OWVisual.nope)}}

@Composable private fun OwnerTile(title:String,copy:String,icon:ImageVector,filled:Boolean,modifier:Modifier,onClick:()->Unit){
    Box(modifier.padding(top=8.dp)){
        Surface(onClick=onClick,color=OWVisual.surface,shape=RoundedCornerShape(26.dp),modifier=Modifier.fillMaxWidth().heightIn(min=192.dp)){
            Column(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=30.dp),verticalArrangement=Arrangement.spacedBy(10.dp,Alignment.CenterVertically),horizontalAlignment=if(filled)Alignment.Start else Alignment.CenterHorizontally){
                if(!filled)Icon(icon,null,Modifier.size(30.dp),tint=OWVisual.inkFaint)
                Text(title,fontSize=if(filled)12.sp else 17.sp,fontWeight=if(filled)FontWeight.Normal else FontWeight.SemiBold,color=if(filled)OWVisual.inkMuted else OWVisual.ink)
                Text(copy,fontSize=if(filled)15.sp else 12.sp,color=if(filled)OWVisual.ink else OWVisual.inkMuted)
            }
        }
        Surface(onClick=onClick,color=OWVisual.space,shape=CircleShape,modifier=Modifier.align(Alignment.TopEnd).offset(y=(-8).dp)){Box(Modifier.size(34.dp),contentAlignment=Alignment.Center){Icon(Icons.Outlined.Add,null,Modifier.size(21.dp),tint=OWVisual.ink)}}
    }
}
