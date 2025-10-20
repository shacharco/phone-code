package com.phonecode

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager

class SSHModulePackage : ReactPackage {
    override fun createNativeModules(reactContext: com.facebook.react.bridge.ReactApplicationContext): List<NativeModule> {
        return listOf(SSHModule(reactContext))
    }

    override fun createViewManagers(reactContext: com.facebook.react.bridge.ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
