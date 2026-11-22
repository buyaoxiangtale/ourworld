package app.ourworld

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

internal fun currentProfileDetails(vm:WorldModel)=vm.profile.o("user").takeIf{it.s("id").isNotBlank()&&it.s("id")==vm.user?.s("id")}?:vm.user?:JSONObject()
internal val educationLevels=listOf("high-school","vocational","associate","bachelor","master","doctorate","other")
internal fun educationLabel(vm:WorldModel,level:String)=when(level){"high-school"->vm.t("高中","High school");"vocational"->vm.t("中专 / 职业教育","Vocational education");"associate"->vm.t("大专","Associate degree");"bachelor"->vm.t("本科","Bachelor’s degree");"master"->vm.t("硕士","Master’s degree");"doctorate"->vm.t("博士","Doctorate");"other"->vm.t("其他","Other");else->""}
internal fun educationText(vm:WorldModel,user:JSONObject)=listOf(user.s("school"),educationLabel(vm,user.s("educationLevel"))).filter{it.isNotBlank()}.joinToString(" · ")
private fun searchKey(value:String)=Normalizer.normalize(value,Normalizer.Form.NFD).replace("\\p{M}+".toRegex(),"").lowercase(Locale.ROOT)
private suspend fun cityCatalogue(vm:WorldModel,kind:String):List<JSONObject>{
    val items=mutableListOf<JSONObject>();var offset=0
    while(true){val page=vm.api.call("/places?kind=$kind&limit=250&offset=$offset");items.addAll(page.a("items").objects());if(page.isNull("nextOffset"))break;val next=page.optInt("nextOffset",-1);check(next>offset){"Invalid catalogue pagination"};offset=next}
    return items.filter{it.s("kind")==kind}.distinctBy{it.s("id")}
}
@Composable fun NativeServiceCities(vm:WorldModel,onClose:()->Unit={vm.back()}){
    BackHandler { if(!vm.busy)onClose() }
    var cities by remember{mutableStateOf(emptyList<JSONObject>())};var countries by remember{mutableStateOf(emptyList<JSONObject>())};var loading by remember{mutableStateOf(true)};var error by remember{mutableStateOf("")};var query by remember{mutableStateOf("")}
    var selected by remember{mutableStateOf(currentProfileDetails(vm).a("cityIds").let{a->(0 until a.length()).map{a.optString(it)}.distinct()})}
    fun load(){vm.run{loading=true;error="";try{cities=cityCatalogue(vm,"city");countries=cityCatalogue(vm,"country")}catch(e:Exception){error=e.message.orEmpty()}finally{loading=false}}}
    LaunchedEffect(Unit){load()}
    val countryNames=countries.associate{it.s("country") to it.localized("name",vm.locale)}
    val words=searchKey(query.trim()).split("\\s+".toRegex()).filter{it.isNotEmpty()}
    val filtered=cities.filter{city->val text=searchKey(listOf(city.o("name").s("zh"),city.o("name").s("en"),city.s("country"),countryNames[city.s("country")].orEmpty(),city.a("aliases").join(" ")).joinToString(" "));words.all{text.contains(it)}}.sortedBy{it.localized("name",vm.locale)}
    fun toggle(id:String){selected=if(id in selected)selected.filter{it!=id}else if(selected.size<50)selected+id else selected}
    Surface(color=OWVisual.bg){Column(Modifier.fillMaxSize()){
        Row(Modifier.fillMaxWidth().padding(horizontal=8.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically){IconButton(onClick=onClose,enabled=!vm.busy){Icon(Icons.Outlined.ArrowBack,vm.t("返回","Back"))};Column{Text(vm.t("服务城市","Service cities"),fontSize=22.sp,fontWeight=FontWeight.SemiBold);Text(vm.t("选择你熟悉、可以提供服务的城市","Choose the cities where you offer your services"),fontSize=12.sp,color=OWVisual.inkMuted)}}
        OutlinedTextField(query,{query=it},label={Text(vm.t("搜索城市、国家或地区","Search cities or countries"))},leadingIcon={Icon(Icons.Outlined.Search,null)},singleLine=true,modifier=Modifier.fillMaxWidth().padding(horizontal=16.dp))
        if(selected.isNotEmpty())LazyRow(Modifier.padding(horizontal=16.dp,vertical=8.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){items(selected){id->InputChip(selected=true,onClick={toggle(id)},label={Text(cities.find{it.s("id")==id}?.localized("name",vm.locale)?:vm.t("已选城市","Selected city"))},trailingIcon={Icon(Icons.Outlined.Close,null,Modifier.size(14.dp))},enabled=!vm.busy)}}
        Row(Modifier.fillMaxWidth().padding(16.dp),horizontalArrangement=Arrangement.SpaceBetween){Text(vm.t("${filtered.size} 座城市","${filtered.size} cities"),fontSize=12.sp,color=OWVisual.inkMuted);Text(vm.t("已选 ${selected.size} / 50","${selected.size} / 50 selected"),fontSize=12.sp,color=OWVisual.inkMuted)}
        if(error.isNotBlank()){Text(error,Modifier.padding(horizontal=16.dp),color=OWVisual.nope);TextButton(onClick=::load){Text(vm.t("重试","Retry"))}}
        if(loading)Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){EarthLoading()}
        else LazyColumn(Modifier.weight(1f).padding(horizontal=16.dp)){
            if(filtered.isEmpty()&&error.isBlank())item{Text(vm.t("未找到城市，请尝试其他名称。","No cities found. Try another name."),Modifier.padding(16.dp))}
            items(filtered,key={it.s("id")}){city->val checked=city.s("id") in selected;Surface(onClick={toggle(city.s("id"))},enabled=!vm.busy&&(checked||selected.size<50),color=OWVisual.bg){Row(Modifier.fillMaxWidth().heightIn(min=72.dp).padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){Icon(Icons.Outlined.LocationOn,null,tint=OWVisual.inkMuted);Column(Modifier.weight(1f)){Text(city.localized("name",vm.locale),fontSize=15.sp);Text(city.o("name").s("en")+" · "+(countryNames[city.s("country")]?:city.s("country")),fontSize=12.sp,color=OWVisual.inkMuted)};Checkbox(checked=checked,onCheckedChange=null)}};HorizontalDivider(color=OWVisual.line)}
        }
        Button(onClick={vm.run{vm.user=vm.api.call("/me","PATCH",json("cityIds" to JSONArray(selected)));vm.profile=vm.api.call("/users/${vm.user!!.s("id")}");vm.notice=vm.t("服务城市已更新","Service cities updated");onClose()}},enabled=!vm.busy&&!loading&&error.isBlank(),modifier=Modifier.fillMaxWidth().padding(16.dp).heightIn(min=48.dp)){Text(vm.t("保存所选城市（${selected.size}）","Save selected cities (${selected.size})"))}
    }}
}
