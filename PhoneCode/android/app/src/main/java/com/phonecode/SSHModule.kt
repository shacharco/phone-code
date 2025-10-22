package com.phonecode

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.jcraft.jsch.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.util.Properties

class SSHModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var session: Session? = null
    private var channel: ChannelShell? = null
    private var writer: PrintWriter? = null
    private var reader: Thread? = null

    companion object {
        private const val TAG = "SSHModule"
    }

    init {
        Log.d(TAG, "SSHModule initialized")
    }

    override fun getName(): String {
        Log.d(TAG, "getName() called")
        return "SSHModule"
    }

    @ReactMethod
    fun connect(host: String, port: Int, username: String, password: String, promise: Promise) {
        Log.d(TAG, "connect() called - host: $host, port: $port, username: $username")
        Thread {
            try {
                Log.d(TAG, "Creating JSch instance")
                val jsch = JSch()
                session = jsch.getSession(username, host, port)
                session?.setPassword(password)

                Log.d(TAG, "Configuring session")
                val config = Properties()
                config["StrictHostKeyChecking"] = "no"
                session?.setConfig(config)

                Log.d(TAG, "Connecting to host...")
                session?.connect(10000)
                Log.d(TAG, "Session connected successfully")

                Log.d(TAG, "Opening shell channel")
                channel = session?.openChannel("shell") as ChannelShell
                // Don't set PTY type for Windows - let it use default
                // channel?.setPtyType("xterm")
                channel?.setPty(false)  // Disable pseudo-terminal for Windows compatibility

                val inputStream = channel?.inputStream
                val outputStream = channel?.outputStream
                writer = PrintWriter(outputStream, true)

                Log.d(TAG, "Connecting channel")
                channel?.connect()
                Log.d(TAG, "Channel connected successfully")

                reader = Thread {
                    try {
                        Log.d(TAG, "Reader thread started")
                        val br = BufferedReader(InputStreamReader(inputStream))
                        val buffer = CharArray(1024)
                        while (!Thread.currentThread().isInterrupted && channel?.isConnected == true) {
                            if (br.ready()) {
                                val count = br.read(buffer)
                                if (count > 0) {
                                    val output = String(buffer, 0, count)
                                    Log.d(TAG, "Received output: ${output.take(50)}...")
                                    sendEvent("onSSHOutput", output)
                                }
                            } else {
                                // Small sleep to prevent tight loop
                                Thread.sleep(50)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Reader thread error", e)
                        if (!Thread.currentThread().isInterrupted) {
                            sendEvent("onSSHError", e.message ?: "Read error")
                        }
                    }
                }
                reader?.start()

                Log.d(TAG, "Connection completed successfully")
                promise.resolve("Connected successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed", e)
                promise.reject("SSH_ERROR", e.message)
            }
        }.start()
    }

    @ReactMethod
    fun executeCommand(command: String, promise: Promise) {
        Log.d(TAG, "executeCommand() called - command: $command")
        try {
            if (writer != null && channel?.isConnected == true) {
                Log.d(TAG, "Executing command")
                writer?.println(command)
                writer?.flush()
                Log.d(TAG, "Command sent successfully")
                promise.resolve(true)
            } else {
                Log.e(TAG, "Not connected - writer: ${writer != null}, channel: ${channel?.isConnected}")
                promise.reject("NOT_CONNECTED", "SSH not connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Command execution failed", e)
            promise.reject("EXEC_ERROR", e.message)
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        Log.d(TAG, "disconnect() called")
        try {
            reader?.interrupt()
            writer?.close()
            channel?.disconnect()
            session?.disconnect()
            Log.d(TAG, "Disconnected successfully")
            promise.resolve("Disconnected")
        } catch (e: Exception) {
            Log.e(TAG, "Disconnect failed", e)
            promise.reject("DISCONNECT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        val connected = session?.isConnected == true && channel?.isConnected == true
        Log.d(TAG, "isConnected() called - result: $connected")
        promise.resolve(connected)
    }

    private fun sendEvent(eventName: String, data: String) {
        Log.d(TAG, "sendEvent() - eventName: $eventName, data length: ${data.length}")
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, data)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        Log.d(TAG, "addListener() - eventName: $eventName")
        // Required for RN EventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        Log.d(TAG, "removeListeners() - count: $count")
        // Required for RN EventEmitter
    }
}