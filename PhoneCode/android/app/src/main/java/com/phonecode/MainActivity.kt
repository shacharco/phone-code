package com.phonecode

import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.content.res.Configuration
import android.content.res.Resources

class MainActivity : ReactActivity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    init {
        Log.d(TAG, "MainActivity instance created")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ✅ Force layout direction to LTR
        val config = Configuration(resources.configuration)
        config.setLayoutDirection(java.util.Locale.ENGLISH)
        resources.updateConfiguration(config, resources.displayMetrics)

        window.decorView.layoutDirection = android.view.View.LAYOUT_DIRECTION_LTR

        Log.d(TAG, "Layout direction forced to LTR")
    }

    override fun getMainComponentName(): String {
        Log.d(TAG, "getMainComponentName() called")
        return "PhoneCode"
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        Log.d(TAG, "createReactActivityDelegate() called")
        return DefaultReactActivityDelegate(this, mainComponentName)
    }
}
