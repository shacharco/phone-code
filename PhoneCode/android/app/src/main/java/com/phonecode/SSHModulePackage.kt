package com.phonecode

import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SSHModulePackage : ReactPackage {
    companion object {
        private const val TAG = "SSHPackage"
    }

    init {
        Log.d(TAG, "SSHPackage initialized")
    }

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        Log.d(TAG, "createNativeModules() called")
        val modules = listOf(SSHModule(reactContext))
        Log.d(TAG, "Created ${modules.size} native modules")
        return modules
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        Log.d(TAG, "createViewManagers() called")
        return emptyList()
    }
}