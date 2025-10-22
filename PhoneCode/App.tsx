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

  useEffect(() => {
    if (!SSHModule) {
      Alert.alert('Error', 'SSHModule not available');
      return;
    }

    const eventEmitter = new NativeEventEmitter(SSHModule);

// Add this helper function at the top of your file
      const stripAnsi = (str: string): string => {
          return str.replace(
              /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
              ''
          );
      };

// Then in your output listener:
      const outputListener = eventEmitter.addListener('onSSHOutput', (data: string) => {
          console.log('Received SSH output:', data);
          const cleanData = stripAnsi(data); // Strip ANSI codes
          console.log('Cleaned output:', cleanData);
          setOutput((prev) => prev + cleanData);
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
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const sendCommand = async () => {
    if (!currentLine.trim()) return;

    try {
      console.log('Sending command:', currentLine);
      await SSHModule.executeCommand(currentLine);
      setCurrentLine('');
      inputRef.current?.focus();
    } catch (err: any) {
      console.error('Command error:', err);
      Alert.alert('Error', err.message || 'Failed to execute command');
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
          <View style={styles.inputLine}>
            <Text style={styles.promptText}>$ </Text>
            <TextInput
              ref={inputRef}
              style={styles.terminalInput}
              value={currentLine}
              onChangeText={setCurrentLine}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
              blurOnSubmit={false}
              returnKeyType="send"
              onSubmitEditing={sendCommand}
              placeholderTextColor="#0a0"
            />
          </View>
        </ScrollView>
      </TouchableOpacity>
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
  promptText: {
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    lineHeight: 20,
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
});