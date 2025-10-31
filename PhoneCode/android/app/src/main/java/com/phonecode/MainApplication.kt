package com.phonecode

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import android.content.res.Configuration
import android.content.res.Resources

class MainApplication : Application(), ReactApplication {

    companion object {
        private const val TAG = "MainApplication"
    }

    init {
        Log.d(TAG, "MainApplication instance created")
    }

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> {
                Log.d(TAG, "getPackages() called")
                return PackageList(this).packages.apply {
                    // Add the SSH package
                    Log.d(TAG, "Adding SSHPackage")
                    add(SSHModulePackage())
                    Log.d(TAG, "Total packages: ${this.size}")
                }
            }

            override fun getJSMainModuleName(): String {
                Log.d(TAG, "getJSMainModuleName() called")
                return "index"
            }

            override fun getUseDeveloperSupport(): Boolean {
                Log.d(TAG, "getUseDeveloperSupport() called: ${BuildConfig.DEBUG}")
                return BuildConfig.DEBUG
            }

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate() called")
        val config = Configuration(resources.configuration)
        config.setLayoutDirection(java.util.Locale.ENGLISH)
        resources.updateConfiguration(config, resources.displayMetrics)
        Log.d("MainApplication", "Forced LTR at application level")

        try {
            Log.d(TAG, "Initializing SoLoader")
            SoLoader.init(this, false)
            Log.d(TAG, "SoLoader initialized successfully")

            // Disable new architecture loading if it causes issues
            // if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            //     load()
            // }
            Log.d(TAG, "Application onCreate completed successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error during onCreate", e)
            throw e
        }
    }
}