package ir.plasco.managing.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import ir.plasco.managing.data.AppContainer
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.screens.DataScreen
import ir.plasco.managing.ui.screens.HomeScreen
import ir.plasco.managing.ui.screens.MoreScreen
import ir.plasco.managing.ui.screens.MovementScreen
import ir.plasco.managing.ui.screens.MovementsScreen
import ir.plasco.managing.ui.screens.ProductFormScreen
import ir.plasco.managing.ui.screens.ProductsScreen
import ir.plasco.managing.ui.screens.StockTakeScreen
import ir.plasco.managing.ui.theme.PlascoTheme
import kotlinx.coroutines.launch

/** مسیرهای برنامه (همان کاره‌ای که HashRouter نسخهٔ وب می‌کرد). */
object Routes {
    const val Home = "home"
    const val Products = "products"
    const val ProductNew = "products/new"
    const val ProductEdit = "products/{id}"
    const val Movements = "movements"
    const val MovementNew = "movements/new?productId={productId}&type={type}"
    const val StockTake = "stocktake"
    const val More = "more"
    const val Data = "more/data"

    fun productEdit(id: ID) = "products/$id"

    fun movementNew(productId: ID? = null, type: String? = null): String {
        val query = buildList {
            if (!productId.isNullOrEmpty()) add("productId=$productId")
            if (!type.isNullOrEmpty()) add("type=$type")
        }
        return if (query.isEmpty()) "movements/new" else "movements/new?" + query.joinToString("&")
    }
}

val LocalAppContainer = staticCompositionLocalOf<AppContainer> { error("AppContainer تزریق نشده") }

/** پیام کوتاه پایین صفحه (همان توست نسخهٔ وب). */
val LocalShowMessage = staticCompositionLocalOf<(String) -> Unit> { {} }

private data class Tab(val route: String, val label: String, val icon: ImageVector)

@Composable
fun AppRoot(container: AppContainer) {
    val settings by container.hub.settings.collectAsStateWithLifecycle()
    var bootError by remember { mutableStateOf<String?>(null) }
    var booted by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            container.boot()
            booted = true
        } catch (error: Throwable) {
            bootError = error.message ?: Fa.errors.failed
        }
    }

    PlascoTheme(mode = settings.theme, textScale = settings.textScale) {
        val navController = rememberNavController()
        val snackbar = remember { SnackbarHostState() }
        val scope = rememberCoroutineScope()
        val showMessage: (String) -> Unit = { message ->
            scope.launch {
                snackbar.currentSnackbarData?.dismiss()
                snackbar.showSnackbar(message)
            }
        }

        androidx.compose.runtime.CompositionLocalProvider(
            LocalAppContainer provides container,
            LocalShowMessage provides showMessage,
        ) {
            Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                if (bootError != null) {
                    BootErrorScreen(bootError ?: Fa.errors.failed)
                } else if (!booted) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(Fa.common.loading, style = MaterialTheme.typography.bodyLarge)
                    }
                } else {
                    val backStackEntry by navController.currentBackStackEntryAsState()
                    val route = backStackEntry?.destination?.route
                    Scaffold(
                        snackbarHost = { SnackbarHost(snackbar) },
                        bottomBar = { BottomBar(navController, route) },
                    ) { padding ->
                        NavHost(
                            navController = navController,
                            startDestination = Routes.Home,
                            modifier = Modifier.padding(padding),
                        ) {
                            composable(Routes.Home) {
                                HomeScreen(
                                    onOpenProduct = { id -> navController.navigate(Routes.productEdit(id)) },
                                    onOpenMovements = { navController.navigate(Routes.Movements) },
                                    onNewMovement = { navController.navigate(Routes.movementNew()) },
                                )
                            }
                            composable(Routes.Products) {
                                ProductsScreen(
                                    onOpenProduct = { id -> navController.navigate(Routes.productEdit(id)) },
                                    onNewProduct = { navController.navigate(Routes.ProductNew) },
                                )
                            }
                            composable(Routes.ProductNew) {
                                ProductFormScreen(
                                    productId = null,
                                    onDone = { navController.popBackStack() },
                                )
                            }
                            composable(
                                route = Routes.ProductEdit,
                                arguments = listOf(navArgument("id") { type = NavType.StringType }),
                            ) { entry ->
                                ProductFormScreen(
                                    productId = entry.arguments?.getString("id"),
                                    onDone = { navController.popBackStack() },
                                )
                            }
                            composable(Routes.Movements) {
                                MovementsScreen(
                                    onNewMovement = { navController.navigate(Routes.movementNew()) },
                                    onOpenProduct = { id -> navController.navigate(Routes.productEdit(id)) },
                                )
                            }
                            composable(
                                route = Routes.MovementNew,
                                arguments = listOf(
                                    navArgument("productId") { type = NavType.StringType; defaultValue = "" },
                                    navArgument("type") { type = NavType.StringType; defaultValue = "" },
                                ),
                            ) { entry ->
                                MovementScreen(
                                    initialProductId = entry.arguments?.getString("productId").orEmpty(),
                                    initialType = entry.arguments?.getString("type").orEmpty(),
                                    onDone = { navController.popBackStack() },
                                )
                            }
                            composable(Routes.StockTake) {
                                StockTakeScreen(onBack = { navController.popBackStack() })
                            }
                            composable(Routes.More) {
                                MoreScreen(
                                    onOpenStockTake = { navController.navigate(Routes.StockTake) },
                                    onOpenData = { navController.navigate(Routes.Data) },
                                )
                            }
                            composable(Routes.Data) {
                                DataScreen(onBack = { navController.popBackStack() })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BottomBar(navController: NavHostController, route: String?) {
    val tabs = listOf(
        Tab(Routes.Home, Fa.nav.home, Icons.Filled.Home),
        Tab(Routes.Products, Fa.nav.products, Icons.Filled.ShoppingCart),
        Tab(Routes.MovementNew, Fa.nav.add, Icons.Filled.Add),
        Tab(Routes.Movements, Fa.nav.movements, Icons.AutoMirrored.Filled.List),
        Tab(Routes.More, Fa.nav.more, Icons.Filled.Menu),
    )
    NavigationBar {
        tabs.forEach { tab ->
            val selected = route == tab.route || (tab.route == Routes.Products && route == Routes.ProductEdit)
            NavigationBarItem(
                selected = selected,
                onClick = {
                    if (tab.route == Routes.MovementNew) {
                        // تپ‌های پیاپی «＋» نباید چند فرم خالی روی هم بچیند.
                        navController.navigate(Routes.movementNew()) { launchSingleTop = true }
                    } else {
                        navController.navigate(tab.route) {
                            popUpTo(Routes.Home) { inclusive = tab.route == Routes.Home }
                            launchSingleTop = true
                        }
                    }
                },
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tab.label) },
            )
        }
    }
}

@Composable
private fun BootErrorScreen(message: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        Text(Fa.errors.title, style = MaterialTheme.typography.titleLarge)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
