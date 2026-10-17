import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// کلید امضای نسخهٔ release بیرون از مخزن نگه داشته می‌شود؛ اگر فایل نباشد
// (کامپیوتر تازه، CI) ساخت debug کار می‌کند و نسخهٔ release بدون امضا می‌ماند.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

android {
    namespace = "ir.plasco.managing"
    compileSdk = 37

    defaultConfig {
        applicationId = "ir.plasco.managing"
        minSdk = 26
        targetSdk = 37
        versionCode = 7
        versionName = "1.2.3"

        // موتور بارکد ML Kit برای هر معماری یک کتابخانهٔ بومی ~۵ مگابایتی دارد
        // (libbarhopper_v3.so). گوشی‌های مغازه ARM هستند، پس فقط دو معماری واقعی
        // بسته می‌شود و x86/x86_64 (که فقط به کار شبیه‌ساز می‌آید) بیرون می‌ماند.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // شبیه‌ساز آزمایشی این کامپیوتر x86_64 است؛ این فیلتر فقط به ساخت
            // debug اضافه می‌شود تا نصب و آزمودن روی شبیه‌ساز ممکن بماند.
            ndk {
                abiFilters += "x86_64"
            }
        }
        release {
            // بدون R8، تقریباً تمام کتابخانه‌های اندرویدیکس و Compose در dex می‌مانند و
            // فقط dex ۱۲ مگابایت از APK را می‌گرفت (۳۳ مگابایت خام، سه فایل dex).
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.core)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.mlkit.barcode.scanning) {
        // ML Kit یک تکهٔ تشخیصی (Clearcut) دارد که همان `transport-backend-cct` است:
        // مجوز INTERNET را به برنامه می‌آورد و لاگ‌هایش را به گوگل می‌فرستد. برنامهٔ مغازه
        // هیچ چیز بیرونی نمی‌خواهد (AGENTS.md بخش ۹: بدون تلمتری)، پس این تکه کنار گذاشته
        // می‌شود؛ مدل بارکد همان‌جاست (assets/mlkit_barcode_models) و آفلاین کار می‌کند.
        exclude(group = "com.google.android.datatransport", module = "transport-backend-cct")
    }

    testImplementation(libs.junit)
}
