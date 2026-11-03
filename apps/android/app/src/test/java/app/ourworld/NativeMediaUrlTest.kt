package app.ourworld

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeMediaUrlTest {
    private val base="http://10.163.136.156:8188/api/v1"

    @Test fun localSeedAvatarUsesPng() {
        assertEquals("http://10.163.136.156:8188/api/v1/seed/avatar/local-1.png",nativeMediaUrl("/api/v1/seed/avatar/local-1.svg",base))
    }
    @Test fun localLegacyCityPreservesQueryAndFragment() {
        assertEquals("http://10.163.136.156:8188/api/v1/assets/city/paris.png?v=2#cover",nativeMediaUrl("http://10.163.136.156:8188/api/v1/assets/city/paris.svg?v=2#cover",base))
    }
    @Test fun uploadedSvgIsUnchanged() {
        assertEquals("http://10.163.136.156:8188/api/v1/uploads/user.svg",nativeMediaUrl("/api/v1/uploads/user.svg",base))
    }
    @Test fun externalSvgIsUnchanged() {
        assertEquals("https://example.com/api/v1/seed/avatar/user.svg",nativeMediaUrl("https://example.com/api/v1/seed/avatar/user.svg",base))
    }
    @Test fun differentPortIsNotOurOrigin() {
        assertEquals("http://10.163.136.156:8080/api/v1/seed/avatar/user.svg",nativeMediaUrl("http://10.163.136.156:8080/api/v1/seed/avatar/user.svg",base))
    }
    @Test fun existingPngIsUnchanged() {
        assertEquals("http://10.163.136.156:8188/api/v1/seed/city/paris.png",nativeMediaUrl("/api/v1/seed/city/paris.png",base))
    }
    @Test fun localCountryIllustrationUsesPng() {
        assertEquals("http://10.163.136.156:8188/api/v1/seed/country/france.png",nativeMediaUrl("/api/v1/seed/country/france.svg",base))
    }
}
