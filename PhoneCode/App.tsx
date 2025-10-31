import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    ScrollView,
    Text,
    TextInput,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
    Alert,
    Keyboard,
} from 'react-native';

import { NativeModules, NativeEventEmitter } from 'react-native';
import Anser from 'anser';

const { SSHModule } = NativeModules;

export default function App() {
    const [connected, setConnected] = useState(false);
    const [host, setHost] = useState('100.75.248.36');
    const [username, setUsername] = useState('shachar');
    const [password, setPassword] = useState('');
    const [output, setOutput] = useState('');
    const [currentLine, setCurrentLineState] = useState('');
    const [ctrlPressed, setCtrlPressed] = useState(false);
    const [pendingSpecialKey, setPendingSpecialKey] = useState('');
    const scrollRef = useRef<ScrollView>(null);
    const inputRef = useRef<TextInput>(null);
    const currentLineRef = useRef("");
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        // Scroll to bottom when keyboard appears
        // scrollRef.current?.scrollToEnd({ animated: true });
      }

    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);
    const setCurrentLine = (value: string) => {
        currentLineRef.current = value;
        setCurrentLineState(value);
    };

    useEffect(() => {
        if (!SSHModule) {
            Alert.alert('Error', 'SSHModule not available');
            return;
        }

        const eventEmitter = new NativeEventEmitter(SSHModule);

        const outputListener = eventEmitter.addListener('onSSHOutput', (data: string) => {
          console.log('Raw SSH output:', JSON.stringify(data));

          // Feed the raw SSH data directly into the terminal emulator
          let parsed = Anser.ansiToText(data);
          console.log('Parsed SSH output:', JSON.stringify(parsed));

          // Extract current visible buffer (what the terminal would show)
          console.log('pendingSpecialKey:', pendingSpecialKey);
          if (pendingSpecialKey) {
            if (pendingSpecialKey === "TAB"){
              parsed = parsed.slice(currentLine.length);
            }
              setCurrentLine(parsed);
            if (data.length > 0) {
                SSHModule.deleteArrowEcho(data.length)
                    .then(() => console.log('Deleted arrow echo'))
                    .catch((err: any) => console.error('Failed to delete arrow echo:', err));
            }
            setPendingSpecialKey('')
          } else {
            console.log("Received Normal SSH output:", JSON.stringify(output), JSON.stringify(parsed));
            setOutput(prev => prev + parsed);

          }

          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        });


        const errorListener = eventEmitter.addListener('onSSHError', (error: string) => {
              console.log('JS: Received SSH error:', error);
              Alert.alert('SSH Error', error);
              setConnected(false);
          });

        return () => {
            outputListener.remove();
            errorListener.remove();
        };
    }, [pendingSpecialKey, currentLine, output]);

    const connect = async () => {
        try {
            await SSHModule.connect(host, 22, username, password);
            setConnected(true);
            setOutput(`Connected to ${host}\n`);
            setTimeout(() => inputRef.current?.focus(), 500);
        } catch (err: any) {
            Alert.alert('Connection Error', err.message || 'Failed to connect');
        }
    };

    const disconnect = async () => {
        try {
            await SSHModule.disconnect();
            setConnected(false);
            setOutput('');
            setCurrentLine('');
            setCtrlPressed(false);
        } catch (err: any) {
            Alert.alert('Error', err.message);
        }
    };

    const sendCommand = async () => {
        if (!currentLine.trim()) {
            try {
                await SSHModule.executeCommand('');
                setCurrentLine('');
                inputRef.current?.focus();
            } catch (err: any) {
                console.error('Command error:', err);
            }
            return;
        }

        try {
            console.log('Sending command:', currentLine);
            setPendingSpecialKey('');
            await SSHModule.executeCommand(currentLine);
            setCurrentLine('');
            inputRef.current?.focus();
        } catch (err: any) {
            console.error('Command error:', err);
            Alert.alert('Error', err.message || 'Failed to execute command');
        }
    };

    const sendSpecialKey = async (key: string) => {
        try {
            console.log('Sending special key:', key, 'with currentInput:', currentLine);

            if (!SSHModule) return;

            // Keys that should update the input line (TAB, arrows)
            const inputUpdatingKeys = ['TAB', 'UP', 'DOWN'];

            if (inputUpdatingKeys.includes(key)) {
              console.log('setPendingSpecialKey true: ', key);
                setPendingSpecialKey(key);
                await SSHModule.sendSpecialKey(currentLine, key);
            } else {
              console.log('setPendingSpecialKey false: ', key);
              // LEFT, RIGHT, Ctrl, ESC, Enter keys
                setPendingSpecialKey('');

                // Clear input for Ctrl keys
                const clearAfterSend = ['CTRL_C', 'CTRL_D', 'CTRL_Z'];
                if (clearAfterSend.includes(key)) {
                    setCurrentLine('');
                }

                await SSHModule.sendSpecialKey(currentLine, key);
            }

            inputRef.current?.focus();
        } catch (err: any) {
            console.error('Special key error:', err);
            Alert.alert('Error', err.message || 'Failed to send special key');
            setPendingSpecialKey('');
        }
    };

    const handleCtrlKey = (key: string) => {
        if (ctrlPressed) {
            const ctrlKey = `CTRL_${key.toUpperCase()}`;
            sendSpecialKey(ctrlKey);
            setCtrlPressed(false);
        }
    };

    const focusInput = () => {
        inputRef.current?.focus();
    };

    if (!connected) {
        return (
            <View style={styles.connectContainer}>
                <Text style={styles.title}>SSH Terminal</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Host (IP Address)"
                    placeholderTextColor="#666"
                    value={host}
                    onChangeText={setHost}
                    autoCapitalize="none"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Username"
                    placeholderTextColor="#666"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#666"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                />
                <TouchableOpacity style={styles.connectButton} onPress={connect}>
                    <Text style={styles.connectButtonText}>Connect</Text>
                </TouchableOpacity>
            </View>
        );
    }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>{username}@{host}</Text>
        <TouchableOpacity onPress={disconnect}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.terminalWrapper}
        activeOpacity={1}
        onPress={focusInput}
      >
        <ScrollView
          style={styles.terminal}
          ref={scrollRef}
          contentContainerStyle={styles.terminalContent}
        >
          <Text style={styles.terminalText} selectable={true}>
            {output}
          </Text>
          <View style={styles.inputLine}>
            <Text style={styles.promptText}>$ </Text>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <TextInput
                ref={inputRef}
                style={styles.terminalInput}
                value={currentLine}
                onChangeText={(text) => {
                  setCurrentLine(text);
                  if (ctrlPressed && text.length > currentLine.length) {
                    const newChar = text[text.length - 1];
                    handleCtrlKey(newChar);
                    setCurrentLine(currentLine);
                  }
                }}
                autoCorrect={false}
                autoCapitalize="none"
                autoFocus
                blurOnSubmit={false}
                returnKeyType="send"
                onSubmitEditing={sendCommand}
                placeholderTextColor="#0a0"
                multiline={false}
              />
            </View>
          </View>
        </ScrollView>
      </TouchableOpacity>

      {/* Custom Keyboard Toolbar - Only show when system keyboard is visible */}
      {isKeyboardVisible && (
        <View style={styles.keyboardToolbar}>
          {/* First Row - Special Keys */}
          <View style={styles.keyboardRow}>
            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => sendSpecialKey('ESC')}
            >
              <Text style={styles.keyButtonText}>ESC</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.keyButton, ctrlPressed && styles.keyButtonActive]}
              onPress={() => setCtrlPressed(!ctrlPressed)}
            >
              <Text style={[styles.keyButtonText, ctrlPressed && styles.keyButtonActiveText]}>
                CTRL
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => sendSpecialKey('TAB')}
            >
              <Text style={styles.keyButtonText}>TAB</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => sendSpecialKey('UP')}
            >
              <Text style={styles.keyButtonText}>↑</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => sendSpecialKey('DOWN')}
            >
              <Text style={styles.keyButtonText}>↓</Text>
            </TouchableOpacity>
          </View>

          {/* Second Row - Common Characters */}
          <View style={styles.keyboardRow}>
            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => setCurrentLine(currentLine + '/')}
            >
              <Text style={styles.keyButtonText}>/</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => setCurrentLine(currentLine + '-')}
            >
              <Text style={styles.keyButtonText}>-</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => setCurrentLine(currentLine + '_')}
            >
              <Text style={styles.keyButtonText}>_</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => setCurrentLine(currentLine + '~')}
            >
              <Text style={styles.keyButtonText}>~</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => setCurrentLine(currentLine + '\\')}
            >
              <Text style={styles.keyButtonText}>\</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    writingDirection: 'ltr'
  },
  connectContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
    color: '#fff',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#2d2d2d',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerText: {
    color: '#0f0',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  disconnectText: {
    color: '#f44',
    fontSize: 14,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    marginBottom: 15,
    padding: 15,
    color: '#fff',
    backgroundColor: '#2d2d2d',
    fontSize: 16,
  },
  connectButton: {
    backgroundColor: '#0a7ea4',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  connectButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  terminalWrapper: {
    flex: 1,
  },
  terminal: {
    flex: 1,
    flexDirection: 'column',
    writingDirection: 'ltr',
    backgroundColor: '#000',
  },
  terminalContent: {
    padding: 10,
    flexGrow: 1,
  },
  terminalText: {
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
  inputLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    writingDirection: 'ltr',
    direction: 'ltr',
  },
  promptText: {
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    lineHeight: 20,
    writingDirection: 'ltr',
    direction: 'ltr',
  },
  terminalInput: {
    flex: 1,
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    padding: 0,
    margin: 0,
    lineHeight: 20,
    minHeight: 20,
    writingDirection: 'ltr',
  },
  keyboardToolbar: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  keyboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: 6,
  },
  keyButton: {
    backgroundColor: '#2d2d2d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyButtonActive: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  keyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  keyButtonActiveText: {
    color: '#fff',
  },
});