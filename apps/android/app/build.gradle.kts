plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose"); id("org.jetbrains.kotlin.kapt") }
android {
    namespace = "app.ourworld"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.ourworld"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE", "\"${providers.gradleProperty("apiBase").getOrElse("http://10.0.2.2:8188/api/v1")}\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    signingConfigs.getByName("debug") {
        storeFile = file("${gradle.gradleUserHomeDir}/ourworld-debug.keystore")
        storePassword = "android"
        keyAlias = "AndroidDebugKey"
        keyPassword = "android"
    }
    buildTypes { release { isMinifyEnabled = false } }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.03.00"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.room:room-runtime:2.7.2")
    implementation("androidx.room:room-ktx:2.7.2")
    kapt("androidx.room:room-compiler:2.7.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
}

val localDebugStore = file("${gradle.gradleUserHomeDir}/ourworld-debug.keystore")
val ensureLocalDebugKey by tasks.registering(Exec::class) {
    outputs.file(localDebugStore)
    onlyIf { !localDebugStore.exists() }
    doFirst { localDebugStore.parentFile.mkdirs() }
    val keytoolName = if (System.getProperty("os.name").lowercase().contains("windows")) "keytool.exe" else "keytool"
    commandLine("${System.getProperty("java.home")}/bin/$keytoolName", "-genkeypair", "-keystore", localDebugStore.absolutePath, "-storepass", "android", "-alias", "AndroidDebugKey", "-keypass", "android", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=Android Debug,O=Android,C=US")
}
tasks.configureEach {
    if (name == "validateSigningDebug") dependsOn(ensureLocalDebugKey)
}
