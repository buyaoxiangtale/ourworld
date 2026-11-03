package app.ourworld

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaAuthorizationTest {
    private val base="http://10.163.136.156:8188/api/v1"
    @Test fun ourRelativeAndAbsoluteImagesMayReceiveAuthorization() {
        assertTrue(sameMediaOrigin("/api/v1/media/file",base))
        assertTrue(sameMediaOrigin("http://10.163.136.156:8188/api/v1/media/file",base))
    }
    @Test fun externalHostsNeverReceiveAuthorization() {
        assertFalse(sameMediaOrigin("http://example.com:8188/api/v1/media/file",base))
    }
    @Test fun crossPortNeverReceivesAuthorization() {
        assertFalse(sameMediaOrigin("http://10.163.136.156:8080/api/v1/media/file",base))
    }
    @Test fun crossProtocolNeverReceivesAuthorization() {
        assertFalse(sameMediaOrigin("https://10.163.136.156:8188/api/v1/media/file",base))
    }
    @Test fun defaultPortsAreComparedByEffectiveValue() {
        assertTrue(sameMediaOrigin("https://EXAMPLE.com:443/image.png","https://example.com/api/v1"))
        assertTrue(sameMediaOrigin("http://example.com:80/image.png","http://example.com/api/v1"))
        assertFalse(sameMediaOrigin("http://example.com:81/image.png","http://example.com/api/v1"))
    }
}
