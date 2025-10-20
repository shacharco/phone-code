package com.phonecode

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.transport.verification.HostKeyVerifier
import java.security.PublicKey

class SSHModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SSHModule"

    @ReactMethod
    fun connectSSH(host: String, username: String, password: String, promise: Promise) {
        try {
            val sshClient = SSHClient()
            val config = sshClient.transport.config

            // ✅ Keep only RSA algorithms
            config.keyExchangeFactories = config.keyExchangeFactories
                .filter { it.name.contains("rsa", ignoreCase = true) }
                .toMutableList()

            config.keyAlgorithms = config.keyAlgorithms
                .filter { it.name.contains("rsa", ignoreCase = true) }
                .toMutableList()

            sshClient.addHostKeyVerifier(object : HostKeyVerifier {
                override fun verify(hostname: String?, port: Int, key: PublicKey?): Boolean {
                    // ✅ Accept only RSA
                    return key?.algorithm == "RSA"
                }
    override fun findExistingAlgorithms(host: String, port: Int): MutableList<String> {
        // Don't restrict KEX — use SSHJ defaults
        return mutableListOf(
            "diffie-hellman-group14-sha1",
            "diffie-hellman-group14-sha256"
        )
    }

            })

            sshClient.connect(host)
            sshClient.authPassword(username, password)
            promise.resolve("Connected successfully with RSA")
        } catch (e: Exception) {
            e.printStackTrace()
            Log.e("SSHModule", "SSH connection failed", e) // ✅ labeled log for easy search
            promise.reject("SSH_ERROR", e.message)
        }
    }
}
