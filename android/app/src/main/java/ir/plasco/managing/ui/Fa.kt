package ir.plasco.managing.ui

/**
 * متن‌های فارسی برنامه — همان جای نسخهٔ وب (src/i18n/fa.ts).
 * اندروید معمولاً strings.xml دارد؛ اینجا یک فایل کاتلین نگه داشته می‌شود تا
 * دو نسخه یک واژه‌نامه داشته باشند و واژه‌ها از هم جدا نشوند.
 */
object Fa {
    object common {
        const val appName = "پلاسکو منیجینگ"
        const val save = "ذخیره"
        const val cancel = "لغو"
        const val delete = "حذف"
        const val edit = "ویرایش"
        const val undo = "واگرد"
        const val search = "جست‌وجو"
        const val more = "بیشتر"
        const val loading = "دارد می‌خواند…"
        const val unknown = "نامشخص"
        const val confirm = "مطمئنی؟"
        const val back = "برگشت"
        const val none = "—"
        const val all = "همه"
    }

    object nav {
        const val home = "خانه"
        const val products = "کالاها"
        const val add = "ثبت"
        const val movements = "حرکات"
        const val more = "بیشتر"
    }

    object home {
        const val title = "خانه"
        const val pieces = "تعداد کل"
        const val sku = "قلم کالا"
        const val costValue = "ارزش خرید"
        const val retailValue = "ارزش فروش"
        const val potentialProfit = "سود بالقوه"
        const val lowTitle = "کم‌موجود"
        const val outTitle = "ناموجود"
        const val allGood = "همه‌چیز مرتب است."
        const val backupReminder = "بیش از ۷ روز است بکاپ نگرفته‌ای."
        const val byLocation = "موجودی هر مکان"
    }

    object products {
        const val title = "کالاها"
        const val newProduct = "کالای جدید"
        const val name = "نام کالا"
        const val code = "کد کالا"
        const val codeHint = "خالی بگذاری، خودش شماره می‌دهد"
        const val brand = "برند"
        const val category = "دسته"
        const val packLabel = "واحد بسته"
        const val packSize = "تعداد در بسته"
        const val buyPrice = "قیمت خرید"
        const val retailPrice = "قیمت فروش"
        const val wholesalePrice = "قیمت عمده"
        const val minStock = "حد هشدار موجودی"
        const val note = "یادداشت"
        const val initialQty = "موجودی اولیه"
        const val initialLocation = "در کدام مکان"
        const val saved = "کالا ثبت شد"
        const val updated = "کالا ذخیره شد"
        const val deleted = "کالا حذف شد"
        const val empty = "هنوز کالایی ثبت نشده."
        const val noResult = "چیزی پیدا نشد."
        const val total = "موجودی"
        const val editTitle = "ویرایش کالا"
        const val minStockHint = "برای هشدار کم‌موجودی؛ خالی بگذار اگر نمی‌خواهی"
    }

    object movements {
        const val title = "حرکات"
        const val newMovement = "ثبت حرکت"
        const val receive = "ثبت ورود"
        const val sale = "ثبت خروج"
        const val adjust = "تعدیل"
        const val damage = "خرابی"
        const val transfer = "انتقال"
        const val count = "شمارش"
        const val initial = "موجودی اولیه"
        const val returnIn = "برگشت از مشتری"
        const val returnOut = "برگشت به فروشنده"
        const val transferIn = "انتقال به"
        const val transferOut = "انتقال از"
        const val qty = "تعداد"
        const val pieces = "عدد"
        const val packs = "بسته"
        const val location = "مکان"
        const val from = "از"
        const val to = "به"
        const val note = "توضیح"
        const val unitPrice = "قیمت واحد"
        const val pickProduct = "کالا را انتخاب کن"
        const val saved = "حرکت ثبت شد"
        const val undone = "واگرد شد"
        const val empty = "هنوز حرکتی ثبت نشده."
        const val undoneMark = "واگرد‌شده"
        const val insufficient = "موجودی این مکان کافی نیست."
        const val notEnough = "بیشتر از موجودی نمی‌شود."
        const val transferSame = "مکان مبدأ و مقصد یکی است."
        const val rebuildHint = "اگر عددی مشکوک است، موجودی‌ها را از روی حرکات بازسازی کن."
        const val rebuild = "بازسازی موجودی‌ها"
        const val rebuilt = "موجودی‌ها بازسازی شد"
    }

    object stocktake {
        const val title = "انبارگردانی"
        const val start = "شروع شمارش"
        const val location = "مکان شمارش"
        const val counted = "شمارش‌شده"
        const val apply = "اعمال شمارش"
        const val applyHint = "برای هر کالایی که شمردی اختلاف حساب می‌شود و حرکات شمارش ثبت می‌شود."
        const val applied = "شمارش اعمال شد"
        const val revert = "بازگردانی اعمال"
        const val reverted = "شمارش برگردانده شد"
        const val uncounted = "نشمرده"
        const val history = "شمارش‌های گذشته"
        const val deltaCount = "{count} کالا در این شمارش تغییر می‌کند"
        const val empty = "برای این مکان چیزی برای شمارش نیست."
        const val cancelTake = "لغو شمارش"
    }

    object more {
        const val title = "بیشتر"
        const val settings = "تنظیمات"
        const val shopName = "اسم فروشگاه"
        const val currencyLabel = "واحد پول"
        const val theme = "رنگ صفحه"
        const val themeSystem = "مطابق گوشی"
        const val themeLight = "روشن"
        const val themeDark = "تیره"
        const val textScale = "اندازهٔ متن"
        const val labels = "برندها، دسته‌ها و مکان‌ها"
        const val brands = "برندها"
        const val categories = "دسته‌ها"
        const val locations = "مکان‌ها"
        const val newBrand = "برند تازه"
        const val newCategory = "دستهٔ تازه"
        const val newLocation = "مکان تازه"
        const val name = "نام"
        const val remove = "حذف"
        const val data = "داده‌ها و بکاپ"
        const val dataHint =
            "نسخهٔ وب بکاپ ZIP می‌سازد؛ در این نسخه هنوز خروجی فایل اضافه نشده است."
        const val lastBackup = "آخرین بکاپ"
        const val never = "هرگز"
        const val about = "درباره"
        const val aboutBody =
            "نسخهٔ اندروید پلاسکو منیجینگ. همهٔ داده‌ها روی خود گوشی می‌مانند و برنامه به اینترنت نیازی ندارد."
        const val costLock = "پنهان‌کردن قیمت خرید"
        const val costLockHint = "برای کارمند؛ فقط نمایشی است."
        const val dataOnDevice = "داده‌ها روی همین گوشی ذخیره می‌شوند."
    }

    object errors {
        const val title = "مشکلی پیش آمد"
        const val saveFailed = "ذخیره نشد."
        const val insufficient = "موجودی کافی نیست."
        const val duplicateCode = "این کد کالا قبلاً استفاده شده."
        const val alreadyUndone = "این حرکت قبلاً واگرد شده."
        const val noProduct = "کالا پیدا نشد."
        const val failed = "انجام نشد."
    }
}
