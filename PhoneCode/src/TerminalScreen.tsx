import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Button,
} from 'react-native';
import { NativeModules, NativeEventEmitter } from 'react-native';

const { SSHModule } = NativeModules;

export default function TerminalScreen() {
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState('192.168.1.5');
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('pass');
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(SSHModule);

    const dataListener = eventEmitter.addListener('onSSHData', (data: string) => {
      setOutputLines((prev) => [...prev, data]);
      scrollRef.current?.scrollToEnd({ animated: true });
    });

    const statusListener = eventEmitter.addListener('onSSHStatus', (status: string) => {
      setOutputLines((prev) => [...prev, `[${status}]`]);
      scrollRef.current?.scrollToEnd({ animated: true });
    });

    return () => {
      dataListener.remove();
      statusListener.remove();
    };
  }, []);

  const connect = async () => {
    try {
      await SSHModule.connect(host, username, password, 22);
      setConnected(true);
    } catch (err: any) {
      setOutputLines((prev) => [...prev, `[Error] ${err.message}`]);
    }
  };

  const sendInput = () => {
    if (!input) return;
    SSHModule.send(input + '\n');
    setOutputLines((prev) => [...prev, input]); // echo user input
    setInput('');
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  if (!connected) {
    return (
      <View style={styles.connectContainer}>
        <Text style={styles.title}>SSH Connection</Text>
        <TextInput
          style={styles.input}
          placeholder="Host"
          value={host}
          onChangeText={setHost}
        />
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Button title="Connect" onPress={connect} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.outputContainer}
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 10 }}
      >
        {outputLines.map((line, idx) => (
          <Text key={idx} style={styles.outputText}>
            {line}
          </Text>
        ))}
      </ScrollView>
      <TextInput
        style={styles.inputLine}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={sendInput}
        autoCorrect={false}
        autoCapitalize="none"
        placeholder="Type command..."
        placeholderTextColor="#888"
        blurOnSubmit={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  connectContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 10,
    padding: 10,
    color: '#fff',
    fontFamily: 'monospace',
    backgroundColor: '#111',
  },
  outputContainer: { flex: 1, padding: 10 },
  outputText: { color: '#0f0', fontFamily: 'monospace' },
  inputLine: {
    borderTopWidth: 1,
    borderColor: '#333',
    padding: 10,
    color: '#fff',
    fontFamily: 'monospace',
    backgroundColor: '#111',
  },
});
