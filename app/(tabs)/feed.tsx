import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Carousel from 'react-native-reanimated-carousel';
import { useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');

export default function FeedScreen() {
  const router = useRouter();
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/feed');
      const data = await res.json();
      setFeed(data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large"/></View>
  }

  if (!feed.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Feed is empty.</Text>
        <Text style={styles.emptySub}>Upload a book to generate hooks!</Text>
        <Pressable onPress={fetchFeed} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>Refresh Feed</Text>
        </Pressable>
      </View>
    )
  }

  const renderInnerSlide = ({ item }: { item: any }) => {
    return (
      <Carousel
        width={width}
        height={height - 160}
        data={[
          { type: 'hook', text: item.hook },
          { type: 'paragraph', text: item.paragraph, paragraph_id: item.paragraph_id, book_id: item.book_id }
        ]}
        scrollAnimationDuration={500}
        renderItem={({ item: slideItem }) => (
          <View style={styles.slideContainer}>
             {slideItem.type === 'hook' ? (
                <View style={styles.hookWrapper}>
                   <Text style={styles.hookLabel}>SWIPE FOR CONTEXT ➡️</Text>
                   <Text style={styles.hookText}>"{slideItem.text}"</Text>
                </View>
             ) : (
                <View style={styles.paragraphWrapper}>
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                    <Text style={styles.paragraphText}>{slideItem.text}</Text>
                  </ScrollView>
                  <Pressable 
                    style={styles.readMoreBtn}
                    onPress={() => router.push({ pathname: '/reader', params: { id: slideItem.book_id, paragraph_id: slideItem.paragraph_id }})}
                  >
                     <Text style={styles.readMoreText}>Read More in Book</Text>
                  </Pressable>
                </View>
             )}
          </View>
        )}
        panGestureHandlerProps={{
          activeOffsetY: [-10, 10],
          failOffsetX: [-10, 10],
        }}
      />
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <Carousel
        loop={false}
        vertical
        width={width}
        height={height - 160}
        data={[...feed].reverse()}
        scrollAnimationDuration={500}
        renderItem={renderInnerSlide}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  slideContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#1c1c1c',
    margin: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#333'
  },
  hookWrapper: {
    flex: 1,
    justifyContent: 'center'
  },
  hookLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 24,
    letterSpacing: 2
  },
  hookText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 42,
  },
  paragraphWrapper: {
    flex: 1,
    justifyContent: 'space-between'
  },
  paragraphText: {
    color: '#ccc',
    fontSize: 20,
    lineHeight: 32,
    marginTop: 40
  },
  readMoreBtn: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  readMoreText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold'
  },
  emptySub: {
    color: '#888',
    marginTop: 8
  },
  refreshBtn: {
    marginTop: 24,
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8
  },
  refreshText: {
    color: '#fff'
  }
});
