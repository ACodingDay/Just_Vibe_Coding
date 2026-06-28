# ================================================================
# Dama ProGuard Rules
# ================================================================

# ── General ──────────────────────────────────────────────────────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Kotlin ───────────────────────────────────────────────────────
# Keep sealed class subclasses (MosaicStyle, MosaicStyleOption, etc.)
-keep class com.yyt.dama.engine.MosaicStyle$** { *; }
-keep class com.yyt.dama.feature.settings.MosaicStyleOption { *; }
-keep class com.yyt.dama.navigation.Route$** { *; }
-keep class com.yyt.dama.navigation.DetectionSource { *; }
-keep class com.yyt.dama.ui.theme.ThemeMode { *; }
-keep class com.yyt.dama.ui.theme.ThemeColor { *; }
-keep class com.yyt.dama.feature.idcard.CardOrientation { *; }
-keep class com.yyt.dama.feature.idcard.CardSide { *; }

# ── ONNX Runtime ────────────────────────────────────────────────
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**

# ── CameraX ─────────────────────────────────────────────────────
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# ── Compose ─────────────────────────────────────────────────────
# Keep Compose compiler-generated classes
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# ── AndroidX Lifecycle / ViewModel ──────────────────────────────
-keep class androidx.lifecycle.** { *; }
-dontwarn androidx.lifecycle.**

# ── Navigation ──────────────────────────────────────────────────
-keep class androidx.navigation.** { *; }
-dontwarn androidx.navigation.**
