# قواعد نگه‌داری R8 برای نسخهٔ نهایی (مینیفای در app/build.gradle.kts روشن است).
#
# تنها کلاس گمشدهٔ بیلد همان تکهٔ تلمتری ML Kit است که در build.gradle.kts عمداً
# کنار گذاشته شده (`com.google.android.datatransport:transport-backend-cct`).
# ارجاعش داخل کد خود ML Kit می‌ماند، ولی مسیر اجرایش در این برنامه هیچ‌وقت گرفته
# نمی‌شود (همین حالا هم در نسخهٔ منتشرشده و بدون R8 این کلاس در APK نیست)، پس فقط
# هشدارش خاموش می‌شود و هیچ کلاسی به APK برنمی‌گردد.
-dontwarn com.google.android.datatransport.cct.CCTDestination

# ML Kit خودش را با «کشف کامپوننت» بالا می‌آورد: نام رجیسترارها در مانیفست است و
# خودشان با رفلکشن (`newInstance()`) ساخته می‌شوند. بدون این قاعده R8 سازندهٔ
# بی‌آرگومان آنها را برمی‌دارد و موتور بارکد در سکوت از کار می‌افتد — نه کرشی
# می‌دهد، نه خطایی؛ چون `BarcodeScanner.kt` شکست ساخت کلاینت را می‌گیرد و پیام
# «دوربین باز نشد» نشان می‌دهد. روی شبیه‌ساز همان اتفاق دیده شد:
# NoSuchMethodException: CommonComponentRegistrar.<init> [] / BarcodeRegistrar / VisionCommonRegistrar
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
