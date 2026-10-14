package ir.plasco.managing.data

import java.util.UUID

/** همان کاری که `crypto.randomUUID()` در نسخهٔ وب می‌کرد. */
fun newId(): String = UUID.randomUUID().toString()
