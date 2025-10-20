import React from 'react';
import { View, Text, Button, Alert } from 'react-native'; // <-- import Alert
import { NativeModules } from 'react-native';

const { SSHModule } = NativeModules;

export default function App() {
  const connect = async () => {
    try {
      const result = await SSHModule.connectSSH('100.75.248.36', 'shachar', 'devisexx');
      Alert.alert('Success', result);
    } catch (error) {
      Alert.alert('Error', error.message || String(error));
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>SSH Test App</Text>
      <Button title="Connect SSH" onPress={connect} />
    </View>
  );
}
