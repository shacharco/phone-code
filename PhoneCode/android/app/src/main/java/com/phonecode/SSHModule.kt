package com.phonecode

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.jcraft.jsch.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.util.Properties

class SSHModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var session: Session? = null
    private var channel: ChannelShell? = null
    private var outputStream: OutputStream? = null
    private var reader: Thread? = null
    private var pendingClear: Boolean = false
    private var lastSentInputLength: Int = 0
    private var clearType: String = "" // "TAB" or "ARROW"

    companion object {
        private const val TAG = "SSHModule"

        // Special key codes
        private const val KEY_TAB = "\t"
        private const val KEY_ESC = "\u001B"
        private const val KEY_UP = "\u001B[A"
        private const val KEY_DOWN = "\u001B[B"
        private const val KEY_RIGHT = "\u001B[C"
        private const val KEY_LEFT = "\u001B[D"
        private const val KEY_CTRL_C = "\u0003"
        private const val KEY_CTRL_D = "\u0004"
        private const val KEY_CTRL_Z = "\u001A"
        private const val KEY_ENTER = "\r"
        private const val KEY_BACKSPACE = "\b"
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

                // Enable PTY for proper terminal behavior
                channel?.setPty(true)
                channel?.setPtyType("xterm-256color")

                // Set terminal size
                channel?.setPtySize(80, 24, 640, 480)

                val inputStream = channel?.inputStream
                outputStream = channel?.outputStream

                Log.d(TAG, "Connecting channel")
                channel?.connect()
                Log.d(TAG, "Channel connected successfully")

reader = Thread {
    try {
        Log.d(TAG, "Reader thread started")
        val br = BufferedReader(InputStreamReader(inputStream))
        val buffer = CharArray(4096)

        val sb = StringBuilder()
        var lastReadTime = System.currentTimeMillis()
        val debounceMs = 120L  // time of silence before flushing accumulated output

        while (!Thread.currentThread().isInterrupted && channel?.isConnected == true) {
            try {
                if (br.ready()) {
                    val count = br.read(buffer)
                    if (count > 0) {
                        val output = String(buffer, 0, count)
                        sb.append(output)
                        lastReadTime = System.currentTimeMillis()
                    }
                } else {
                    // If no new data for debounceMs, flush accumulated output
                    if (sb.isNotEmpty() && System.currentTimeMillis() - lastReadTime > debounceMs) {
                        val bulkOutput = sb.toString()
                        sb.setLength(0)
                        Log.d(TAG, "Flushed consolidated output: ${bulkOutput.take(100)}...")
                        sendEvent("onSSHOutput", bulkOutput)
                    }
                    Thread.sleep(50)
                }
            } catch (e: InterruptedException) {
                Log.d(TAG, "Reader thread interrupted (expected during disconnect)")
                break
            }
        }

        // Flush any remaining data before exiting
        if (sb.isNotEmpty()) {
            sendEvent("onSSHOutput", sb.toString())
        }

        Log.d(TAG, "Reader thread exiting normally")
    } catch (e: InterruptedException) {
        Log.d(TAG, "Reader thread interrupted during shutdown")
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
            if (outputStream != null && channel?.isConnected == true) {
                Log.d(TAG, "Executing command")

                // Send the command followed by Enter
                val commandWithEnter = command + KEY_ENTER
                outputStream?.write(commandWithEnter.toByteArray())
                outputStream?.flush()
                Log.d(TAG, "Command sent successfully")
                promise.resolve(true)
            } else {
                Log.e(TAG, "Not connected - outputStream: ${outputStream != null}, channel: ${channel?.isConnected}")
                promise.reject("NOT_CONNECTED", "SSH not connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Command execution failed", e)
            promise.reject("EXEC_ERROR", e.message)
        }
    }

    @ReactMethod
    fun sendSpecialKey(currentInput: String, key: String, promise: Promise) {
        Log.d(TAG, "sendSpecialKey() called - key: $key, currentInput: $currentInput")
        try {
            if (outputStream == null || channel?.isConnected != true) {
                promise.reject("NOT_CONNECTED", "SSH not connected")
                return
            }

            when (key) {
                "TAB" -> {
                    // Send input + tab
                    outputStream?.write(currentInput.toByteArray())
                    outputStream?.write(KEY_TAB.toByteArray())
                    outputStream?.flush()

                    // Mark to send backspaces after output
                    pendingClear = true
                    lastSentInputLength = currentInput.length
                    clearType = "TAB"

                    promise.resolve(true)
                }
                "UP", "DOWN" -> {
                    // Send the arrow key
                    val code = if (key == "UP") KEY_UP else KEY_DOWN
                    outputStream?.write(code.toByteArray())
                    outputStream?.flush()

                    // Don't set pendingClear here - we'll get the length from JS
                    clearType = "ARROW"

                    promise.resolve(true)
                }
                "LEFT", "RIGHT" -> {
                    val code = if (key == "LEFT") KEY_LEFT else KEY_RIGHT
                    outputStream?.write(code.toByteArray())
                    outputStream?.flush()
                    promise.resolve(true)
                }
                "CTRL_C", "CTRL_D", "CTRL_Z" -> {
                    if (currentInput.isNotEmpty()) {
                        outputStream?.write(currentInput.toByteArray())
                    }
                    val code = when (key) {
                        "CTRL_C" -> KEY_CTRL_C
                        "CTRL_D" -> KEY_CTRL_D
                        "CTRL_Z" -> KEY_CTRL_Z
                        else -> ""
                    }
                    outputStream?.write(code.toByteArray())
                    outputStream?.flush()
                    promise.resolve(true)
                }
                "ESC" -> {
                    outputStream?.write(KEY_ESC.toByteArray())
                    outputStream?.flush()
                    promise.resolve(true)
                }
                "ENTER" -> {
                    outputStream?.write(currentInput.toByteArray())
                    outputStream?.write(KEY_ENTER.toByteArray())
                    outputStream?.flush()
                    promise.resolve(true)
                }
                else -> {
                    promise.reject("UNKNOWN_KEY", "Unknown special key: $key")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "sendSpecialKey error", e)
            promise.reject("SEND_ERROR", e.message)
        }
    }

    @ReactMethod
    fun deleteArrowEcho(length: Int, promise: Promise) {
        Log.d(TAG, "deleteArrowEcho() called - length: $length")
        try {
            if (outputStream != null && channel?.isConnected == true && length > 0) {
                Log.d(TAG, "Deleting arrow echo: $length chars")
                repeat(length) {
                    outputStream?.write(KEY_BACKSPACE.toByteArray())
                    outputStream?.write(" ".toByteArray())
                    outputStream?.write(KEY_BACKSPACE.toByteArray())
                }
                outputStream?.flush()
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "deleteArrowEcho error", e)
            promise.reject("DELETE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        Log.d(TAG, "disconnect() called")
        try {
            reader?.interrupt()
            outputStream?.close()
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