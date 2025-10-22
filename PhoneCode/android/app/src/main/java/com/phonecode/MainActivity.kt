package com.phonecode

import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    init {
        Log.d(TAG, "MainActivity instance created")
    }

    /**
     * Returns the name of the main component registered from JavaScript.
     */
    override fun getMainComponentName(): String {
        Log.d(TAG, "getMainComponentName() called")
        return "PhoneCode"
    }

    /**
     * Returns the instance of the [ReactActivityDelegate].
     * For RN 0.82+, we use DefaultReactActivityDelegate which handles new architecture.
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate {
        Log.d(TAG, "createReactActivityDelegate() called")
        return DefaultReactActivityDelegate(this, mainComponentName)
    }
}