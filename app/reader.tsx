import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useLibrary } from '../lib/LibraryContext';
import Pdf from 'react-native-pdf';
import { BookOpen, FileText, ZoomIn, ZoomOut, ChevronLeft } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';

export default function ReaderScreen() {
  const router = useRouter();
  const { id, anchor } = useLocalSearchParams();
  const { books } = useLibrary();
  const scrollViewRef = useRef<ScrollView>(null);
  const yOffsets = useRef<Record<string, number>>({});
  const book = books.find(b => b.id === id);

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isReadingMode, setIsReadingMode] = useState(!!anchor);

  // Responsive Text Engine Values
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1);
  const baseFontSize = 18;
  const currentSize = baseFontSize * fontSizeMultiplier;

  if (!book) {
    return (
      <View style={[styles.container, { paddingTop: 60, paddingHorizontal: 16 }]}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: 24, alignSelf: 'flex-start' }}>
          <ChevronLeft color="#fff" size={28} />
        </Pressable>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>Book not found in active session.</Text>
          <Text style={{ color: '#888', marginTop: 8 }}>Please delete and re-upload the PDF to restore state.</Text>
        </View>
      </View>
    );
  }

  // Jump from Original PDF to Reader Mode
  useEffect(() => {
    if (isReadingMode && book.page_anchors) {
      const targetAnchor = book.page_anchors[currentPage.toString()];
      if (targetAnchor && yOffsets.current[targetAnchor] !== undefined) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: yOffsets.current[targetAnchor], animated: false });
        }, 300);
      }
    }
  }, [isReadingMode]);

  // Jump from Reader Mode dragging to Original PDF Page
  const handleScroll = (event: any) => {
    if (!isReadingMode || !book.page_anchors) return;
    const currentY = event.nativeEvent.contentOffset.y;
    
    let closestPage = currentPage;
    let minDiff = Infinity;

    for (const [page, anchorText] of Object.entries(book.page_anchors)) {
        const anchorY = yOffsets.current[anchorText];
        if (anchorY !== undefined) {
           const diff = Math.abs(anchorY - currentY);
           if (diff < minDiff) {
               minDiff = diff;
               closestPage = parseInt(page);
           }
        }
    }
    if (closestPage !== currentPage) {
      setCurrentPage(closestPage);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 60 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={{ paddingRight: 12 }}>
            <ChevronLeft color="#fff" size={28} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{book.title}</Text>
            {!isReadingMode && (
              <Text style={styles.pageTracker}>
                Page {currentPage} of {totalPages || '?'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          {isReadingMode && (
            <View style={styles.fontControls}>
              <Pressable 
                onPress={() => setFontSizeMultiplier(prev => Math.max(0.5, prev - 0.2))}
                style={styles.fontBtn}
              >
                <ZoomOut color="#ccc" size={18} />
              </Pressable>
              <Pressable 
                onPress={() => setFontSizeMultiplier(prev => Math.min(3.0, prev + 0.2))}
                style={styles.fontBtn}
              >
                <ZoomIn color="#ccc" size={18} />
              </Pressable>
            </View>
          )}

          <Pressable 
            style={styles.modeToggle}
            onPress={() => setIsReadingMode(!isReadingMode)}
          >
            {isReadingMode ? (
              <FileText color="#fff" size={20} />
            ) : (
              <BookOpen color="#fff" size={20} />
            )}
            <Text style={styles.modeToggleText}>
              {isReadingMode ? "Original" : "Reader"}
            </Text>
          </Pressable>
        </View>
      </View>

      {isReadingMode ? (
        <View style={styles.responsiveReaderCanvas}>
          <ScrollView 
            ref={scrollViewRef} 
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={100}
          >
            <Markdown 
              rules={{
                paragraph: (node, children, parent, styles) => {
                  const rawText = node.content;
                  return (
                    <View 
                      key={node.key} 
                      onLayout={(e) => {
                        const y = e.nativeEvent.layout.y;
                        if (rawText) {
                            // Extract signature footprint spanning first 30 chars
                            const chunk = rawText.substring(0, 30).trim();
                            yOffsets.current[chunk] = y;
                            
                            // Native UI feed anchor routing support
                            if (typeof anchor === 'string') {
                                if (rawText.startsWith(anchor) || rawText.includes(anchor)) {
                                    setTimeout(() => {
                                      scrollViewRef.current?.scrollTo({ y, animated: true });
                                    }, 100);
                                }
                            }
                        }
                      }}
                      style={{ marginBottom: 16 }}
                    >
                      {children}
                    </View>
                  );
                },
                image: (node, children, parent, styles) => {
                  return (
                    <Image
                      key={node.key}
                      style={{ width: '100%', aspectRatio: 1.5, resizeMode: 'contain', marginVertical: 16 }}
                      source={{ uri: node.attributes.src }}
                      alt={node.attributes.alt}
                    />
                  );
                }
              }}
              style={{
              body: { 
                color: '#e0e0e0', 
                fontSize: currentSize, 
                lineHeight: currentSize * 1.6,
              },
              heading1: { 
                color: '#fff', 
                marginTop: 24, 
                marginBottom: 12, 
                fontSize: currentSize * 1.5 
              },
              heading2: { 
                color: '#fff', 
                marginTop: 20, 
                marginBottom: 10, 
                fontSize: currentSize * 1.3 
              },
              list_item: { 
                color: '#e0e0e0', 
                fontSize: currentSize, 
                marginBottom: 4 
              }
            }}>
              {book.text || "Loading markdown..."}
            </Markdown>
          </ScrollView>
        </View>
      ) : (
        <Pdf
          page={currentPage}
          source={{ uri: book.uri, cache: true }}
          onLoadComplete={(numberOfPages) => setTotalPages(numberOfPages)}
          onPageChanged={(page) => setCurrentPage(page)}
          onError={(error) => console.log("PDF Render Error:", error)}
          style={styles.pdf}
          trustAllCerts={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222'
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pageTracker: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
  },
  fontControls: {
    flexDirection: 'row',
    backgroundColor: '#222',
    borderRadius: 8,
    overflow: 'hidden',
  },
  fontBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#111',
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeToggleText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  responsiveReaderCanvas: {
    flex: 1, 
    flexWrap: 'wrap',
    paddingHorizontal: 20
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width,
    backgroundColor: '#111',
  }
});
