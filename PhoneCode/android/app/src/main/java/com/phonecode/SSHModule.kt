package com.phonecode

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.jcraft.jsch.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.io.OutputStream
import java.util.Properties

class SSHModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var session: Session? = null
    private var channel: ChannelShell? = null
    private var writer: PrintWriter? = null
    private var outputStream: OutputStream? = null
    private var reader: Thread? = null

    companion object {
        private const val TAG = "SSHModule"

        // ANSI escape codes and control characters
        private const val CTRL_C = 3.toChar()  // ETX - End of Text
        private const val CTRL_D = 4.toChar()  // EOT - End of Transmission
        private const val CTRL_Z = 26.toChar() // SUB - Substitute
        private const val TAB = 9.toChar()     // HT - Horizontal Tab
        private const val ESC = 27.toChar()    // ESC - Escape
        private const val ENTER = 13.toChar()  // CR - Carriage Return
        private const val BACKSPACE = 8.toChar() // BS - Backspace (try 8 instead of 127)
        private const val ARROW_UP = "\u001B[A"
        private const val ARROW_DOWN = "\u001B[B"
        private const val ARROW_RIGHT = "\u001B[C"
        private const val ARROW_LEFT = "\u001B[D"
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

                // Enable PTY for interactive features (tab completion, arrow keys)
                channel?.setPtyType("xterm")
                channel?.setPty(true)

                val inputStream = channel?.inputStream
                outputStream = channel?.outputStream
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
                            try {
                                if (br.ready()) {
                                    val count = br.read(buffer)
                                    if (count > 0) {
                                        val output = String(buffer, 0, count)
                                        Log.d(TAG, "Received output: ${output.take(50)}...")
                                        sendEvent("onSSHOutput", output)
                                    }
                                } else {
                                    Thread.sleep(50)
                                }
                            } catch (e: InterruptedException) {
                                Log.d(TAG, "Reader thread interrupted (expected during disconnect)")
                                break
                            }
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
                outputStream?.write("$command\n".toByteArray())
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
    fun sendRawInput(text: String, promise: Promise) {
        Log.d(TAG, "sendRawInput() called - text: $text")
        try {
            if (outputStream != null && channel?.isConnected == true) {
                Log.d(TAG, "Sending raw input")
                outputStream?.write(text.toByteArray())
                outputStream?.flush()
                Log.d(TAG, "Raw input sent successfully")
                promise.resolve(true)
            } else {
                Log.e(TAG, "Not connected")
                promise.reject("NOT_CONNECTED", "SSH not connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Raw input send failed", e)
            promise.reject("RAW_INPUT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun sendSpecialKey(key: String, promise: Promise) {
        Log.d(TAG, "sendSpecialKey() called - key: $key")
        try {
            if (outputStream != null && channel?.isConnected == true) {
                val keySequence = when (key) {
                    "CTRL_C" -> CTRL_C.toString()
                    "CTRL_D" -> CTRL_D.toString()
                    "CTRL_Z" -> CTRL_Z.toString()
                    "TAB" -> TAB.toString()
                    "ESC" -> ESC.toString()
                    "ENTER" -> ENTER.toString()
                    "BACKSPACE" -> BACKSPACE.toString()
                    "UP" -> ARROW_UP
                    "DOWN" -> ARROW_DOWN
                    "LEFT" -> ARROW_LEFT
                    "RIGHT" -> ARROW_RIGHT
                    else -> {
                        promise.reject("INVALID_KEY", "Unknown special key: $key")
                        return
                    }
                }

                Log.d(TAG, "Sending special key sequence")
                outputStream?.write(keySequence.toByteArray())
                outputStream?.flush()
                Log.d(TAG, "Special key sent successfully")
                promise.resolve(true)
            } else {
                Log.e(TAG, "Not connected")
                promise.reject("NOT_CONNECTED", "SSH not connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Special key send failed", e)
            promise.reject("SPECIAL_KEY_ERROR", e.message)
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        Log.d(TAG, "disconnect() called")
        try {
            reader?.interrupt()
            writer?.close()
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
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        Log.d(TAG, "removeListeners() - count: $count")
    }
}