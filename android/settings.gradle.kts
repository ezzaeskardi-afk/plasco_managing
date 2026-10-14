// پلاسکو منیجینگ — نسخهٔ اندروید (Kotlin + Compose + Room)
// همان برنامهٔ آفلاین مغازه، این بار به‌صورت اپ اندروید بومی.
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "PlascoManaging"
include(":app")
