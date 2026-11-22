package app.ourworld

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import java.util.UUID

@Composable fun NativeProfileCardEditor(vm:WorldModel,section:String){
    val initial=remember(section){vm.layout.a("blocks").objects().filter{it.s("type")==section}}
    var photos by remember(section){mutableStateOf(initial.flatMap{it.a("refs").let{a->(0 until a.length()).map{a.optString(it)}}}.distinct())}
    var prompts by remember(section){mutableStateOf(initial.flatMap{it.a("prompts").objects()}.map{it.s("question") to it.s("answer")}.ifEmpty{listOf("" to "")})}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->uri?.let{vm.upload(it,"public"){file->photos=photos+file.s("url")}}}
    val valid=section=="gallery"||prompts.all{it.first.isNotBlank()&&it.first.length<=120&&it.second.isNotBlank()&&it.second.length<=500}
    Form(vm,if(section=="gallery")vm.t("我的照片","My photos") else vm.t("我的旅行问答","My travel prompts")){
        if(section=="gallery"){
            photos.forEachIndexed{i,url->
                Picture(url,160)
                Row{
                    IconButton(enabled=i>0&&!vm.busy,onClick={photos=photos.toMutableList().also{val item=it.removeAt(i);it.add(i-1,item)}}){Icon(Icons.Outlined.ArrowUpward,vm.t("前移照片","Move photo earlier"))}
                    IconButton(enabled=i<photos.lastIndex&&!vm.busy,onClick={photos=photos.toMutableList().also{val item=it.removeAt(i);it.add(i+1,item)}}){Icon(Icons.Outlined.ArrowDownward,vm.t("后移照片","Move photo later"))}
                    IconButton(enabled=!vm.busy,onClick={photos=photos.filterIndexed{j,_->j!=i}}){Icon(Icons.Outlined.Delete,vm.t("删除照片","Remove photo"))}
                }
            }
            Action(vm.t("添加照片","Add photos"),!vm.busy){picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))}
        }else{
            prompts.forEachIndexed{i,item->
                OutlinedCard(Modifier.fillMaxWidth()){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                    Field(item.first,vm.t("问题","Question")){value->prompts=prompts.mapIndexed{j,p->if(j==i)value to p.second else p}}
                    Field(item.second,vm.t("我的回答","My answer")){value->prompts=prompts.mapIndexed{j,p->if(j==i)p.first to value else p}}
                    TextButton(onClick={prompts=prompts.filterIndexed{j,_->j!=i}},enabled=!vm.busy){Text(vm.t("删除问答","Remove prompt"))}
                }}
            }
            Action(vm.t("添加旅行问答","Add travel prompt"),prompts.size<5&&!vm.busy){prompts=prompts+("" to "")}
        }
        Action(vm.t("保存并更新主页","Save and update profile"),valid&&!vm.busy){
            vm.run{
                val original=vm.layout.a("blocks").objects();val first=original.indexOfFirst{it.s("type")==section}
                val remaining=original.filter{it.s("type")!=section}.toMutableList()
                if(if(section=="gallery")photos.isNotEmpty() else prompts.isNotEmpty()){
                    val block=initial.firstOrNull()?.let{org.json.JSONObject(it.toString())}?:json("id" to UUID.randomUUID().toString(),"type" to section,"span" to 2,"size" to "compact")
                    if(section=="gallery")block.put("refs",JSONArray(photos)) else block.put("prompts",JSONArray(prompts.map{json("question" to it.first.trim(),"answer" to it.second.trim())}))
                    remaining.add(if(first<0)remaining.size else minOf(first,remaining.size),block)
                }
                if(remaining.isEmpty())remaining.add(json("id" to UUID.randomUUID().toString(),"type" to "intro","span" to 2,"size" to "compact"))
                vm.layout=org.json.JSONObject(vm.layout.toString()).put("blocks",JSONArray(remaining));vm.saveDraft()
                vm.api.call("/profile/publish","POST",json("revision" to vm.draft.optInt("revision")))
                vm.profile=vm.api.call("/users/${vm.user!!.s("id")}");vm.route="";vm.notice=vm.t("主页已更新","Profile updated")
            }
        }
    }
}
