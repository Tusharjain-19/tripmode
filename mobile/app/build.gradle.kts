plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.serialization)
}

android {
  namespace = "app.tripmode.convoy"
  compileSdk = 36

  defaultConfig {
    applicationId = "app.tripmode.convoy"
    minSdk = 26
    targetSdk = 35
    versionCode = 3
    versionName = "1.0.2"
  }

  signingConfigs {
    create("release") {
      storeFile = file("release.keystore")
      storePassword = "tripmode2026"
      keyAlias = "tripmode"
      keyPassword = "tripmode2026"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("release")
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
    debug {
      signingConfig = signingConfigs.getByName("release")
    }
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

kotlin {
  jvmToolchain(17)
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation("androidx.car.app:app:1.4.0")
  implementation("androidx.car.app:app-projected:1.4.0")
}
