// AGP 9 کاتلین را خودش می‌آورد (built-in Kotlin)؛ برای بالا بردن نسخهٔ کاتلین
// همان روش مستندشده را می‌رویم: نسخهٔ دلخواه روی buildscript classpath.
buildscript {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21")
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
