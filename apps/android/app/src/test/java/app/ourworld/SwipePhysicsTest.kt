package app.ourworld

import org.junit.Assert.assertEquals
import org.junit.Test

class SwipePhysicsTest {
    @Test fun slowDragUsesDistance(){
        assertEquals(0,SwipePhysics.direction(96f,0f,400f,0f))
        assertEquals(1,SwipePhysics.direction(100f,0f,400f,0f))
        assertEquals(-1,SwipePhysics.direction(-100f,0f,400f,0f))
    }
    @Test fun shortFlingNeedsSpeedAndMinimumTravel(){
        assertEquals(0,SwipePhysics.direction(31f,0f,400f,1500f))
        assertEquals(0,SwipePhysics.direction(40f,0f,400f,899f))
        assertEquals(1,SwipePhysics.direction(40f,0f,400f,900f))
        assertEquals(-1,SwipePhysics.direction(-40f,0f,400f,-1200f))
    }
    @Test fun verticalAndReversingGesturesDoNotCommit(){
        assertEquals(0,SwipePhysics.direction(110f,120f,400f,1500f))
        assertEquals(0,SwipePhysics.direction(110f,0f,400f,-1500f))
        assertEquals(0,SwipePhysics.direction(100f,0f,0f,1500f))
    }
    @Test fun exitTimeStaysWithinUsableBounds(){
        assertEquals(180,SwipePhysics.exitMillis(500f,400f,6000f))
        assertEquals(280,SwipePhysics.exitMillis(600f,400f,0f))
    }
}
