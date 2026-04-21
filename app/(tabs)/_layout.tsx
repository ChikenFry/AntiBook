import { Tabs } from 'expo-router';
import { BookOpen, Newspaper } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: '#111' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
      tabBarStyle: { backgroundColor: '#151515', borderTopColor: '#222' },
      tabBarActiveTintColor: '#fff',
      tabBarInactiveTintColor: '#666'
    }}>
      <Tabs.Screen 
        name="library" 
        options={{ 
          title: 'Library', 
          tabBarIcon: ({ color }) => <BookOpen color={color} size={24} /> 
        }} 
      />
      <Tabs.Screen 
        name="feed" 
        options={{ 
          title: 'Feed', 
          tabBarIcon: ({ color }) => <Newspaper color={color} size={24} /> 
        }} 
      />
    </Tabs>
  );
}
