package app.ourworld

import android.animation.ValueAnimator
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.math.abs

@Composable fun DiscoveryDeck(vm:WorldModel,onRange:()->Unit) {
    val density=LocalDensity.current.density
    val view=LocalView.current
    val scope=rememberCoroutineScope()
    val x=remember{Animatable(0f)}
    val y=remember{Animatable(0f)}
    var width by remember{mutableFloatStateOf(1f)}
    var locked by remember{mutableStateOf(false)}
    var returning by remember{mutableStateOf<Job?>(null)}
    var crossed by remember{mutableStateOf(false)}
    val reduced=!ValueAnimator.areAnimatorsEnabled()
    val person=vm.people.getOrNull(vm.personIndex)
    val progress=(abs(x.value)/(width*.25f)).coerceIn(0f,1f)
    fun reset(){returning?.cancel();returning=scope.launch{x.animateTo(0f,spring(.82f,400f));y.snapTo(0f)}}
    fun choose(direction:Int,velocity:Float=0f){
        val selected=person?:return
        if(locked)return
        if(direction>0 && !vm.ensureConnectAuth(selected)){scope.launch{x.snapTo(0f);y.snapTo(0f)};return}
        val generation=vm.feedGeneration
        locked=true;returning?.cancel()
        scope.launch{
            try{
                val result=async{direction<0 || vm.connectForSwipe(selected)}
                val target=if(reduced)0f else direction*width*1.4f
                x.animateTo(target,tween(if(reduced)80 else SwipePhysics.exitMillis(target-x.value,width,velocity)))
                val success=result.await()
                if(success)vm.advancePerson(selected.s("id"),generation)
                else x.animateTo(0f,spring(.82f,400f))
                x.snapTo(0f);y.snapTo(0f)
            }finally{locked=false}
        }
    }
    LaunchedEffect(person?.s("id")){if(!locked){returning?.cancel();x.snapTo(0f);y.snapTo(0f)};crossed=false}
    LaunchedEffect(vm.resumeConnectId){if(person!=null && vm.resumeConnectId==person.s("id")){vm.resumeConnectId="";choose(1)}}
    Column(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.14f))){
        Row(Modifier.fillMaxWidth().padding(horizontal=8.dp).heightIn(min=56.dp),verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick={vm.route="city"},modifier=Modifier.size(48.dp)){Icon(Icons.Outlined.ArrowBack,vm.t("返回","Back"),tint=OWVisual.ink)}
            Column(Modifier.weight(1f)){
                Text(if(vm.feedCities.size>1)"${vm.feedCities.size} "+vm.t("个城市","cities") else vm.city?.localized("name",vm.locale).orEmpty(),fontSize=22.sp,fontWeight=FontWeight.SemiBold,color=OWVisual.ink,maxLines=1,overflow=TextOverflow.Ellipsis)
                Text(vm.t("认识当地人","Meet the locals"),fontSize=12.sp,color=OWVisual.inkMuted)
            }
            IconButton(onClick=onRange,enabled=!locked,modifier=Modifier.size(48.dp)){Icon(Icons.Outlined.Tune,vm.t("相遇范围","Places"),tint=OWVisual.ink)}
        }
        Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal=16.dp,vertical=8.dp).onSizeChanged{width=it.width.toFloat()},contentAlignment=Alignment.Center){
            if(person==null){
                Column(Modifier.fillMaxWidth().background(OWVisual.surface,RoundedCornerShape(24.dp)).padding(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
                    if(vm.peopleLoading)EarthLoading(diameter=28.dp)
                    else {
                        Text(if(vm.peopleError.isNotEmpty())vm.t("暂时无法载入人物","Couldn't load people") else vm.t("这一轮，先到这里","You've explored this round"),fontSize=22.sp,color=OWVisual.ink)
                        Text(vm.peopleError.ifEmpty{vm.t("重新开始，或返回地图探索另一座城市。","Start again or discover another city.")},color=OWVisual.inkMuted,fontSize=14.sp)
                        Button(onClick={if(vm.peopleError.isNotEmpty())vm.retryPeople() else vm.restartPeople()}){Text(vm.t("重新载入","Try again"))}
                    }
                }
            }else {
                for(depth in 2 downTo 0){
                    val p=vm.people.getOrNull(vm.personIndex+depth)?:continue
                    val scale=if(depth==0)1f else 1f-depth*.04f+progress*.04f
                    Box(Modifier.fillMaxSize().graphicsLayer{
                        scaleX=scale;scaleY=scale
                        translationY=if(depth==0)y.value*.15f else (depth-progress)*10f*density
                        translationX=if(depth==0)x.value else 0f
                        rotationZ=if(depth==0 && !reduced)(x.value/width*12f).coerceIn(-12f,12f) else 0f
                    }.then(if(depth==0)Modifier.pointerInput(p.s("id"),locked){
                        if(locked)return@pointerInput
                        var rawX=0f;var rawY=0f;var horizontal:Boolean?=null
                        val tracker=VelocityTracker()
                        detectDragGestures(onDragStart={returning?.cancel();rawX=x.value;rawY=0f;horizontal=null;crossed=false;tracker.resetTracking()},
                            onDragCancel={reset()},onDragEnd={
                                val vx=tracker.calculateVelocity().x
                                val direction=if(horizontal==true)SwipePhysics.direction(rawX/density,rawY/density,width/density,vx/density) else 0
                                if(direction==0)reset() else choose(direction,vx)
                            }){change,amount->
                            rawX+=amount.x;rawY+=amount.y
                            tracker.addPosition(change.uptimeMillis,change.position)
                            if(horizontal==null)horizontal=abs(rawX)>abs(rawY)*1.2f
                            if(horizontal==true){
                                change.consume();scope.launch{x.snapTo(rawX);y.snapTo(rawY.coerceIn(-32*density,32*density))}
                                if(!crossed && abs(rawX)>=width*.25f){crossed=true;view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)}
                            }
                        }
                    } else Modifier).clip(RoundedCornerShape(24.dp)).background(OWVisual.raised)){
                        NativePhoto(p.s("avatar"),Modifier.fillMaxSize(),p.s("name"))
                        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent,Color.Transparent,Color.Black.copy(alpha=.80f)))))
                        if(depth==0){
                            Column(Modifier.align(Alignment.BottomStart).padding(start=20.dp,end=68.dp,bottom=24.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                                Text(p.s("name"),fontSize=32.sp,fontWeight=FontWeight.SemiBold,color=Color.White,maxLines=2,overflow=TextOverflow.Ellipsis)
                                Text(if(p.s("id").startsWith("demo-")||p.s("id").startsWith("load-"))vm.t("AI 演示人物","AI demo profile") else if(p.s("accountType")=="agency"){if(p.s("providerStatus")=="approved")vm.t("认证旅行社","Certified agency") else vm.t("旅行社认证审核中","Agency certification pending")} else if(p.s("providerStatus")=="approved")vm.t("个人导游","Personal guide") else vm.t("认识当地人","Meet a local"),fontSize=12.sp,color=Color.White)
                                if(!p.isNull("rating")||!p.isNull("priceRange")){val unit=when(p.o("priceRange").s("unit")){"hour"->vm.t("小时","hour");"half-day"->vm.t("半日","half-day");"experience"->vm.t("次","experience");else->vm.t("天","day")};Text(listOfNotNull(if(!p.isNull("rating"))"★ ${p.d("rating").trim0()}"else null,if(!p.isNull("priceRange"))"${p.o("priceRange").s("currency")} ${p.o("priceRange").d("min").trim0()}–${p.o("priceRange").d("max").trim0()} / $unit"else null).joinToString(" · "),fontSize=14.sp,fontWeight=FontWeight.SemiBold,color=Color.White)}
                                val tags=p.a("tags").let{a->(0 until minOf(2,a.length())).map{a.optString(it)}}
                                if(tags.isNotEmpty())Text(tags.joinToString(" · "),color=Color.White,fontSize=14.sp,maxLines=2)
                            }
                            IconButton(onClick={if(!locked)vm.openProfile(p.s("id"))},modifier=Modifier.align(Alignment.BottomEnd).padding(end=12.dp,bottom=16.dp).size(48.dp)){Icon(Icons.Outlined.Info,vm.t("查看主页","View profile"),tint=Color.White)}
                            if(progress>.03f)Text(if(x.value>0)vm.t("聊一聊","LET'S TALK") else vm.t("略过","PASS"),color=if(x.value>0)OWVisual.like else OWVisual.nope,fontSize=22.sp,fontWeight=FontWeight.Bold,modifier=Modifier.align(if(x.value>0)Alignment.TopStart else Alignment.TopEnd).padding(20.dp).graphicsLayer{alpha=progress}.background(OWVisual.surface,RoundedCornerShape(12.dp)).padding(12.dp))
                        }
                    }
                }
            }
        }
        if(vm.peopleError.isNotBlank() && person!=null)Row(Modifier.padding(horizontal=16.dp).background(OWVisual.surface,RoundedCornerShape(12.dp)).padding(horizontal=12.dp),verticalAlignment=Alignment.CenterVertically){Text(vm.peopleError,color=OWVisual.ink,fontSize=14.sp,modifier=Modifier.weight(1f));TextButton(onClick={choose(1)},enabled=!locked){Text(vm.t("重试","Retry"),color=OWVisual.ink)}}
        if(person!=null)Row(Modifier.fillMaxWidth().height(80.dp),horizontalArrangement=Arrangement.spacedBy(32.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.CenterVertically){
            FilledIconButton(onClick={choose(-1)},enabled=!locked,modifier=Modifier.size(56.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=OWVisual.nope,contentColor=OWVisual.bg)){Icon(Icons.Outlined.Close,vm.t("略过","Pass"),Modifier.size(26.dp))}
            FilledIconButton(onClick={choose(1)},enabled=!locked,modifier=Modifier.size(60.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=OWVisual.like,contentColor=OWVisual.bg)){if(locked && vm.connectingPerson.isNotBlank())EarthLoading(diameter=22.dp) else Icon(Icons.Outlined.ChatBubbleOutline,vm.t("加入对话","Add to chat"),Modifier.size(26.dp))}
        }
    }
}
