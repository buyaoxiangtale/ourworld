package app.ourworld

import kotlin.math.abs
import kotlin.math.sign

internal object SwipePhysics {
    fun direction(x:Float,y:Float,width:Float,velocity:Float):Int {
        if(width<=0 || abs(x)<=abs(y)*1.2f)return 0
        val fast=abs(velocity)>=OWVisual.motion_flingVelocity
        if(fast && sign(velocity)!=sign(x))return 0
        if(abs(x)>=width*OWVisual.motion_distancePercent/100f ||
            (abs(x)>=width*OWVisual.motion_flingPercent/100f && fast))return if(x>0)1 else -1
        return 0
    }
    fun exitMillis(remaining:Float,width:Float,velocity:Float):Int =
        (abs(remaining)/maxOf(abs(velocity),width*4f)*1000f).toInt().coerceIn(OWVisual.motion_exitMin,OWVisual.motion_exitMax)
}
