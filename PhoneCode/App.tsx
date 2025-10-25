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
} from 'react-native';
import { NativeModules, NativeEventEmitter } from 'react-native';

const { SSHModule } = NativeModules;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState('100.75.248.36');
  const [username, setUsername] = useState('shachar');
  const [password, setPassword] = useState('');
  const [output, setOutput] = useState('');
  const [currentLine, setCurrentLine] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const lastSentLength = useRef(0);

  // Process terminal output to handle control sequences
  const processTerminalOutput = (data: string, prevOutput: string): string => {
    // Strip ALL ANSI/VT100 escape sequences - be VERY aggressive
    let cleaned = data;

    // Keep stripping until no more ESC sequences found
    let prevLength;
    do {
      prevLength = cleaned.length;
      cleaned = cleaned
        // ESC [ ... (any character) - CSI sequences
        .replace(/\x1b\[[^\x40-\x7e]*[\x40-\x7e]/g, '')
        // ESC [ ? ... (with question mark)
        .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
        // ESC ] ... BEL (OSC sequences ending with bell)
        .replace(/\x1b\][^\x07\x1b]*\x07/g, '')
        // ESC ] ... ESC \ (OSC sequences ending with ST)
        .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
        // ESC ( ... or ESC ) ... (charset selection)
        .replace(/\x1b[()][0-9A-Z]/g, '')
        // Any other ESC + single char
        .replace(/\x1b[^[]./g, '')
        // Leftover standalone ESC
        .replace(/\x1b/g, '');
    } while (cleaned.length < prevLength);

    let result = prevOutput;
    let i = 0;

    while (i < cleaned.length) {
      const char = cleaned[i];
      const charCode = cleaned.charCodeAt(i);

      // Handle backspace/delete - remove last non-newline character
      if (charCode === 8 || charCode === 127) {
        // Find and remove the last character that's not a newline
        let pos = result.length - 1;
        while (pos >= 0 && result[pos] === '\n') {
          pos--;
        }
        if (pos >= 0) {
          result = result.substring(0, pos) + result.substring(pos + 1);
        }
      }
      // Handle \r\n (Windows line ending) - treat as newline
      else if (charCode === 13 && i + 1 < cleaned.length && cleaned.charCodeAt(i + 1) === 10) {
        result += '\n';
        i++; // Skip the \n
      }
      // Handle \r alone (carriage return - clear current line and replace)
      else if (charCode === 13) {
        // Find the start of the current line (after last \n)
        const lastNewline = result.lastIndexOf('\n');
        // Remove everything after the last newline (or everything if no newline)
        if (lastNewline >= 0) {
          result = result.substring(0, lastNewline + 1);
        } else {
          result = '';
        }
      }
      // Handle \n alone
      else if (charCode === 10) {
        result += '\n';
      }
      // Handle tab
      else if (charCode === 9) {
        result += '  ';
      }
      // Handle printable ASCII characters only
      else if (charCode >= 32 && charCode < 127) {
        result += char;
      }

      i++;
    }

    return result;
  };

  useEffect(() => {
    if (!SSHModule) {
      Alert.alert('Error', 'SSHModule not available');
      return;
    }

    const eventEmitter = new NativeEventEmitter(SSHModule);

    const outputListener = eventEmitter.addListener('onSSHOutput', (data: string) => {
      console.log('Received SSH output:', data);
      console.log('Raw bytes:', Array.from(data).map(c => c.charCodeAt(0)).join(','));

      setOutput((prev) => {
        // Check if this looks like a backspace operation (cursor movement + spaces + cursor movement back)
        // Pattern: ESC[row;colH + spaces + ESC[row;colH (same position)
        const backspacePattern = /\x1b\[(\d+);(\d+)H(\s+)\x1b\[\1;\2H/;
        const backspaceMatch = data.match(backspacePattern);

        if (backspaceMatch) {
          // This is the server doing a visual backspace - delete one character
          console.log('Detected backspace operation');
          const numSpaces = backspaceMatch[3].length;
          // Delete as many characters as there were spaces
          let result = prev;
          for (let i = 0; i < numSpaces && result.length > 0; i++) {
            if (result[result.length - 1] !== '\n') {
              result = result.slice(0, -1);
            }
          }
          return result;
        }

        // Check if data contains cursor positioning for line replacement (tab/arrow keys)
        // But exclude backspace operations
        const hasCursorPos = /\x1b\[\d+;\d+H/.test(data);
        const hasMultipleChars = data.replace(/\x1b\[[^\x40-\x7e]*[\x40-\x7e]/g, '').trim().length > 3;

        if (hasCursorPos && hasMultipleChars) {
          console.log('Detected cursor positioning with content - clearing current line');
          // Clear the current line before processing new content
          const lastNewline = prev.lastIndexOf('\n');
          const beforeLastLine = lastNewline >= 0 ? prev.substring(0, lastNewline + 1) : '';
          const processed = processTerminalOutput(data, beforeLastLine);
          console.log('Processed output length:', processed.length);
          return processed;
        }

        const processed = processTerminalOutput(data, prev);
        console.log('Processed output length:', processed.length);
        return processed;
      });
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
  }, []);

  const connect = async () => {
    try {
      await SSHModule.connect(host, 22, username, password);
      setConnected(true);
      setOutput(`Connected to ${host}\n`);
      lastSentLength.current = 0;
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
      lastSentLength.current = 0;
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // Handle text input changes - send character by character
  const handleTextChange = async (text: string) => {
    setCurrentLine(text);

    try {
      const lastLength = lastSentLength.current;
      const currentLength = text.length;

      if (currentLength > lastLength) {
        // Characters were added - send the new characters
        const newChars = text.substring(lastLength);
        await SSHModule.sendRawInput(newChars);
      } else if (currentLength < lastLength) {
        // Characters were deleted - send backspace
        const deleteCount = lastLength - currentLength;
        for (let i = 0; i < deleteCount; i++) {
          await SSHModule.sendSpecialKey('BACKSPACE');
        }
      }

      lastSentLength.current = currentLength;
    } catch (err: any) {
      console.error('Input error:', err);
    }
  };

  const sendCommand = async () => {
    try {
      console.log('Sending enter key');
      await SSHModule.sendSpecialKey('ENTER');
      setCurrentLine('');
      lastSentLength.current = 0;
      inputRef.current?.focus();
    } catch (err: any) {
      console.error('Command error:', err);
      Alert.alert('Error', err.message || 'Failed to execute command');
    }
  };

  const sendSpecialKey = async (key: string) => {
    try {
      console.log('Sending special key:', key);
      await SSHModule.sendSpecialKey(key);

      // Clear local state for keys that modify the line
      if (key === 'TAB' || key === 'UP' || key === 'DOWN' || key === 'CTRL_C') {
        setCurrentLine('');
        lastSentLength.current = 0;
      }

      inputRef.current?.focus();
    } catch (err: any) {
      console.error('Special key error:', err);
      Alert.alert('Error', err.message || 'Failed to send special key');
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
          <Text style={styles.terminalText}>{output}</Text>
        </ScrollView>
        {/* Hidden input for keyboard - completely invisible */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={currentLine}
          onChangeText={handleTextChange}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus
          blurOnSubmit={false}
          returnKeyType="send"
          onSubmitEditing={sendCommand}
        />
      </TouchableOpacity>

      {/* Custom Keyboard Toolbar */}
      <View style={styles.keyboardToolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.keyboardScrollContent}
        >
          <TouchableOpacity
            style={styles.keyButton}
            onPress={() => sendSpecialKey('CTRL_C')}
          >
            <Text style={styles.keyButtonText}>Ctrl+C</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.keyButton}
            onPress={() => sendSpecialKey('CTRL_D')}
          >
            <Text style={styles.keyButtonText}>Ctrl+D</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.keyButton}
            onPress={() => sendSpecialKey('CTRL_Z')}
          >
            <Text style={styles.keyButtonText}>Ctrl+Z</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.keyButton}
            onPress={() => sendSpecialKey('TAB')}
          >
            <Text style={styles.keyButtonText}>Tab ↹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.keyButton}
            onPress={() => sendSpecialKey('ESC')}
          >
            <Text style={styles.keyButtonText}>Esc</Text>
          </TouchableOpacity>

          <View style={styles.arrowGroup}>
            <TouchableOpacity
              style={styles.arrowButton}
              onPress={() => sendSpecialKey('UP')}
            >
              <Text style={styles.arrowText}>↑</Text>
            </TouchableOpacity>

            <View style={styles.arrowRow}>
              <TouchableOpacity
                style={styles.arrowButton}
                onPress={() => sendSpecialKey('LEFT')}
              >
                <Text style={styles.arrowText}>←</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.arrowButton}
                onPress={() => sendSpecialKey('DOWN')}
              >
                <Text style={styles.arrowText}>↓</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.arrowButton}
                onPress={() => sendSpecialKey('RIGHT')}
              >
                <Text style={styles.arrowText}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000'
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
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  keyboardToolbar: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 8,
  },
  keyboardScrollContent: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  keyButton: {
    backgroundColor: '#2d2d2d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#444',
    minWidth: 70,
    alignItems: 'center',
  },
  keyButtonText: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  arrowGroup: {
    marginLeft: 8,
    alignItems: 'center',
  },
  arrowRow: {
    flexDirection: 'row',
  },
  arrowButton: {
    backgroundColor: '#2d2d2d',
    width: 45,
    height: 40,
    borderRadius: 6,
    margin: 2,
    borderWidth: 1,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    color: '#0f0',
    fontSize: 20,
    fontWeight: 'bold',
  },
});