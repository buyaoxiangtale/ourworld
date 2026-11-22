package app.ourworld

import android.annotation.SuppressLint
import android.graphics.BitmapFactory
import android.view.MotionEvent
import android.view.View
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import kotlin.math.roundToInt

@Composable
private fun globeBitmap(file: String) = LocalContext.current.assets.let { assets ->
    remember(assets, file) {
        runCatching { assets.open("globe/textures/$file").use { BitmapFactory.decodeStream(it)?.asImageBitmap() } }.getOrNull()
    }
}

@Composable
fun Modifier.starlight(): Modifier {
    val stars = globeBitmap("stars.png")
    val transition = rememberInfiniteTransition(label = "Stars")
    val shimmer by transition.animateFloat(
        initialValue = .15f, targetValue = .8f,
        animationSpec = infiniteRepeatable(tween(2600), RepeatMode.Reverse), label = "Twinkle"
    )
    return drawWithCache {
        val sky = Brush.radialGradient(listOf(OWVisual.nebula, OWVisual.space), radius = (size.maxDimension * .65f).coerceAtLeast(1f))
        val area = IntSize(size.width.roundToInt(), size.height.roundToInt())
        val twinkles = listOf(Offset(.16f, .21f), Offset(.84f, .41f), Offset(.38f, .78f))
        onDrawBehind {
            drawRect(sky)
            stars?.let { drawImage(it, dstSize = area) }
            for (point in twinkles) {
                drawCircle(OWVisual.starBright.copy(alpha = shimmer), 1.25.dp.toPx(), Offset(size.width * point.x, size.height * point.y))
            }
        }
    }
}

@Composable
fun EarthLoading(modifier: Modifier = Modifier, diameter: Dp = 28.dp) {
    val atlas = globeBitmap("earth-spinner.png")
    val transition = rememberInfiniteTransition(label = "Earth")
    val rotation by transition.animateFloat(
        initialValue = 0f, targetValue = 36f,
        animationSpec = infiniteRepeatable(tween(1800, easing = LinearEasing)), label = "Rotation"
    )
    Canvas(modifier.size(diameter).semantics { contentDescription = "加载中 / Loading" }) {
        if (atlas != null) {
            val imageSize = IntSize(atlas.height, atlas.height)
            val frame = IntOffset(rotation.toInt().coerceIn(0, 35) * imageSize.width, 0)
            drawImage(atlas, srcOffset = frame, srcSize = imageSize, dstSize = IntSize(size.width.roundToInt(), size.height.roundToInt()))
        } else {
            drawCircle(Brush.radialGradient(listOf(OWVisual.ink, OWVisual.raised), Offset(size.width * .33f, size.height * .28f)))
        }
    }
}

@Composable
fun PlanetIcon(tab: Int, selected: Boolean) {
    Box(
        Modifier.size(OWVisual.spacing_planetIcon.dp).alpha(if (selected) 1f else .61f)
            .drawWithCache {
                val glow = Brush.radialGradient(listOf(OWVisual.ink.copy(alpha = .33f), Color.Transparent))
                val ring = Stroke(1.5.dp.toPx())
                val lineHalfWidth = 8.5.dp.toPx()
                onDrawWithContent {
                    if (selected) drawRect(glow)
                    drawContent()
                    if (selected) {
                        drawCircle(OWVisual.ink.copy(alpha = .85f), size.minDimension / 2 - ring.width / 2, style = ring)
                        val lineY = size.height + 4.dp.toPx()
                        drawLine(OWVisual.ink, Offset(center.x - lineHalfWidth, lineY), Offset(center.x + lineHalfWidth, lineY), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        when (tab) {
            0 -> MiniatureEarth()
            3 -> SpinningPlanet("community")
            1 -> SpinningPlanet("chat")
            2 -> SpinningPlanet("profile")
            else -> Unit
        }
    }
}

@Composable
private fun SpinningPlanet(name: String) {
    val atlas = globeBitmap("planet-$name.png")
    val columns = 8
    val rows = 12
    val frames = columns * rows
    val transition = rememberInfiniteTransition(label = "Planet rotation")
    val progress by transition.animateFloat(
        initialValue = 0f, targetValue = frames.toFloat(),
        animationSpec = infiniteRepeatable(tween(8000, easing = LinearEasing)), label = name
    )
    Canvas(Modifier.size(OWVisual.spacing_planetViewport.dp)) {
        if (atlas == null) {
            drawCircle(Brush.radialGradient(listOf(OWVisual.inkMuted, OWVisual.line)))
            return@Canvas
        }
        val frame = progress.toInt().coerceIn(0, frames - 1)
        val tile = IntSize(atlas.width / columns, atlas.height / rows)
        drawImage(
            atlas,
            srcOffset = IntOffset(frame % columns * tile.width, frame / columns * tile.height),
            srcSize = tile,
            dstSize = IntSize(size.width.roundToInt(), size.height.roundToInt()),
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun MiniatureEarth() {
    val context = LocalContext.current
    var miniature by remember { mutableStateOf<WebView?>(null) }
    AndroidView(
        factory = {
            object : WebView(it) {
                override fun onTouchEvent(event: MotionEvent) = false
            }.apply {
                isFocusable = false
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context)).build()
                webViewClient = object : WebViewClientCompat() {
                    override fun shouldInterceptRequest(view: WebView, request: android.webkit.WebResourceRequest) = loader.shouldInterceptRequest(request.url)
                    override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest) = true
                }
                loadUrl("https://appassets.androidplatform.net/assets/globe/mini.html")
                miniature = this
            }
        },
        modifier = Modifier.size(OWVisual.spacing_planetViewport.dp),
        onReset = null,
        onRelease = { it.destroy() },
    )
    PauseWebViewWithActivity(miniature)
}

@Composable
fun PauseWebViewWithActivity(web: WebView?) {
    val lifecycle = (LocalContext.current as? ComponentActivity)?.lifecycle
    DisposableEffect(lifecycle, web) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> web?.onResume()
                Lifecycle.Event.ON_PAUSE -> web?.onPause()
                else -> Unit
            }
        }
        lifecycle?.addObserver(observer)
        onDispose { lifecycle?.removeObserver(observer) }
    }
}
