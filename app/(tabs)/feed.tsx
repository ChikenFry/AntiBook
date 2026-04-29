import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, Pressable, ScrollView, FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useLibrary } from '../../lib/LibraryContext';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height - 160;

export default function FeedScreen() {
  const router = useRouter();
  const { books } = useLibrary();
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which horizontal slide is active per feed item (0 = hook, 1 = paragraph)
  const slideIndex = useRef<Record<string, number>>({});
  const [, forceUpdate] = useState(0);

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

  // Refetch every time this tab comes into focus so deletions and new uploads
  // are reflected immediately without requiring a manual refresh.
  useFocusEffect(useCallback(() => {
    fetchFeed();
  }, [fetchFeed]));

  // Only show hooks for books that are currently in the library
  const activeBookIds = new Set(books.map(b => b.id));
  const activeFeed = feed.filter(item => activeBookIds.has(item.book_id));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large"/></View>;
  }

  if (!activeFeed.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Feed is empty.</Text>
        <Text style={styles.emptySub}>Upload a book to generate hooks!</Text>
        <Pressable onPress={fetchFeed} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
    );
  }

  const renderFeedItem = ({ item }: { item: any }) => {
    const key = String(item.id);
    const active = slideIndex.current[key] ?? 0;

    const onHorizontalScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      if (slideIndex.current[key] !== idx) {
        slideIndex.current[key] = idx;
        forceUpdate(n => n + 1);
      }
    };

    return (
      // Outer wrapper: exact page dimensions for the vertical FlatList paging
      <View style={{ width, height: ITEM_HEIGHT }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onHorizontalScroll}
          style={{ flex: 1 }}
        >
          {/* Slide 1: Hook */}
          <View style={{ width, height: ITEM_HEIGHT, padding: 16 }}>
            <View style={[styles.card, { justifyContent: 'center' }]}>
              <Text style={styles.swipeHint}>SWIPE FOR CONTEXT  →</Text>
              <Text style={styles.hookText}>"{item.hook}"</Text>
            </View>
          </View>

          {/* Slide 2: Paragraph + Read More */}
          <View style={{ width, height: ITEM_HEIGHT, padding: 16 }}>
            <View style={styles.card}>
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                <Text style={styles.paragraphText}>{item.paragraph}</Text>
              </ScrollView>
              <Pressable
                style={styles.readMoreBtn}
                onPress={() => router.push({ pathname: '/reader', params: { id: item.book_id, page: item.paragraph_id } })}
              >
                <Text style={styles.readMoreText}>Read in Book</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Dot indicator */}
        <View style={styles.dots}>
          <View style={[styles.dot, active === 0 && styles.dotActive]} />
          <View style={[styles.dot, active === 1 && styles.dotActive]} />
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={[...activeFeed].reverse()}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderFeedItem}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      style={styles.container}
      getItemLayout={(_, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
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
  card: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 28,
  },
  swipeHint: {
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 28,
    textTransform: 'uppercase',
  },
  hookText: {
    color: '#f0f0f0',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 38,
    letterSpacing: 0.3,
  },
  paragraphText: {
    color: '#bbb',
    fontSize: 17,
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  readMoreBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  readMoreText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
  dots: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#444',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptySub: {
    color: '#666',
    marginTop: 8,
    fontSize: 14,
  },
  refreshBtn: {
    marginTop: 24,
    backgroundColor: '#222',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshText: {
    color: '#fff',
    fontWeight: '600',
  },
});
