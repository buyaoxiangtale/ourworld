package app.ourworld

import org.junit.Assert.assertEquals
import org.junit.Test

class ProfileReferencesTest {
    private data class Resource(val id:String,val title:String)
    private val rows=listOf(Resource("a","First"),Resource("b","Second"),Resource("c","Third"))

    @Test fun explicitReferencesSelectAndOrderResources() {
        assertEquals(listOf(rows[2],rows[0]),referencedResources(rows,listOf("c","a")){it.id})
    }
    @Test fun missingReferencesDoNotExposeOtherResources() {
        assertEquals(emptyList<Resource>(),referencedResources(rows,listOf("not-owned")){it.id})
    }
    @Test fun emptyReferencesKeepOriginalFallback() {
        assertEquals(rows,referencedResources(rows,emptyList()){it.id})
    }
}
