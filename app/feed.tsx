import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLibrary } from '../lib/LibraryContext';
import { generateFeedFromText, FeedPost } from '../lib/feedGenerator';
import Carousel from 'react-native-reanimated-carousel';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BookOpen } from 'lucide-react-native';

const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = Dimensions.get('window');

// A Post can have multiple slides (Slide 1: Hook, Slide 2: Paragraph)
const InnerCarousel = ({ post, bookId }: { post: FeedPost; bookId: string }) => {
  const router = useRouter();
  const slides = [
    { type: 'hook', content: post.hook },
    { type: 'paragraph', content: post.paragraph }
  ];

  return (
    <View style={styles.postContainer}>
      <Carousel
        width={PAGE_WIDTH}
        height={PAGE_HEIGHT - 100} // Adjusting for some UI
        data={slides}
        loop={false}
        renderItem={({ item, index }) => (
          <View style={styles.slideContent}>
            {item.type === 'hook' ? (
              <Text style={styles.hookText}>"{item.content}"</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.paragraphText}>{item.content}</Text>
              </ScrollView>
            )}
            <View style={styles.pagination}>
              <View style={[styles.dot, index === 0 && styles.dotActive]} />
              <View style={[styles.dot, index === 1 && styles.dotActive]} />
            </View>
          </View>
        )}
      />
      {/* Read More floating button */}
      <Pressable 
        style={styles.readMoreBtn} 
        onPress={() => router.push({ pathname: '/reader', params: { id: bookId } })}
      >
        <BookOpen color="#000" size={18} />
        <Text style={styles.readMoreText}>Read Entire Book</Text>
      </Pressable>
    </View>
  );
};

export default function FeedScreen() {
  const { id } = useLocalSearchParams();
  const { books } = useLibrary();
  const book = books.find(b => b.id === id);

  const posts = useMemo(() => {
    if (!book || !book.text) return [];
    return generateFeedFromText(book.text);
  }, [book]);

  if (!book) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#fff' }}>Book not found.</Text>
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#fff' }}>Not enough text to generate a feed.</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <Carousel
        loop={true}
        vertical={true}
        width={PAGE_WIDTH}
        height={PAGE_HEIGHT}
        data={posts}
        renderItem={({ item }) => <InnerCarousel post={item} bookId={book.id} />}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050505',
  },
  postContainer: {
    flex: 1,
    backgroundColor: '#050505',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  hookText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 44,
  },
  paragraphText: {
    fontSize: 20,
    fontWeight: '400',
    color: '#d0d0d0',
    lineHeight: 32,
    marginTop: 40,
  },
  pagination: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
  },
  readMoreBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    gap: 8,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  readMoreText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  }
});
