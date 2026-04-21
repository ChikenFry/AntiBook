import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, Pressable, ScrollView, FlatList } from 'react-native';
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

  const renderFeedItem = ({ item }: { item: any }) => (
    // Horizontal ScrollView for hook → paragraph swiping.
    // Being a native scroll component, it only intercepts horizontal gestures,
    // allowing the outer vertical FlatList to freely handle up/down swipes.
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={{ width, height: height - 160 }}
    >
      {/* Slide 1: Hook */}
      <View style={[styles.slideContainer, { width }]}>
        <View style={styles.hookWrapper}>
          <Text style={styles.hookLabel}>SWIPE FOR CONTEXT ➡️</Text>
          <Text style={styles.hookText}>"{item.hook}"</Text>
        </View>
      </View>

      {/* Slide 2: Paragraph + Read More */}
      <View style={[styles.slideContainer, { width }]}>
        <View style={styles.paragraphWrapper}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={styles.paragraphText}>{item.paragraph}</Text>
          </ScrollView>
          <Pressable
            style={styles.readMoreBtn}
            onPress={() => router.push({ pathname: '/reader', params: { id: item.book_id, paragraph_id: item.paragraph_id } })}
          >
            <Text style={styles.readMoreText}>Read More in Book</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  return (
    // Native FlatList with pagingEnabled for vertical feed scrolling.
    // Using a native component (instead of gesture-handler-based Carousel)
    // eliminates gesture conflicts with the inner horizontal ScrollView.
    <FlatList
      data={[...feed].reverse()}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderFeedItem}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      style={styles.container}
      getItemLayout={(_, index) => ({
        length: height - 160,
        offset: (height - 160) * index,
        index,
      })}
    />
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
