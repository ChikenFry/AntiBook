import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, ChevronLeft, FileText, ZoomIn, ZoomOut } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import Pdf from 'react-native-pdf';
import { useLibrary } from '../lib/LibraryContext';

export default function ReaderScreen() {
  const router = useRouter();
  const { id, anchor, page } = useLocalSearchParams();
  const { books } = useLibrary();
  const scrollViewRef = useRef<ScrollView>(null);
  const yOffsets = useRef<Record<string, number>>({});
  const pendingReaderAnchorRef = useRef<string | null>(null);
  const hasScrolledToAnchorRef = useRef(false);
  const contentSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const book = books.find(b => b.id === id);
  const pageAnchors = book?.page_anchors;

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(page ? parseInt(page as string, 10) : 1);
  const [isReadingMode, setIsReadingMode] = useState(false);

  // Responsive Text Engine Values
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1);
  const baseFontSize = 16; // reduced for concrete view
  const currentSize = baseFontSize * fontSizeMultiplier;

  // Scroll to the exact page marker, or the closest available one if the exact marker
  // was not injected (page only had headings/lists/tables, no extractable text paragraphs).
  const performScrollToPage = (target: string) => {
    const exactY = yOffsets.current[target];
    if (exactY !== undefined) {
      pendingReaderAnchorRef.current = null;
      scrollViewRef.current?.scrollTo({ y: exactY, animated: false });
      return;
    }
    const targetNum = parseInt(target, 10);
    const pages = Object.keys(yOffsets.current).map(Number).filter(n => !isNaN(n));
    if (!pages.length) return;
    const closest = pages.reduce((a, b) => (Math.abs(b - targetNum) < Math.abs(a - targetNum) ? b : a));
    const closestY = yOffsets.current[String(closest)];
    if (closestY !== undefined) {
      pendingReaderAnchorRef.current = null;
      scrollViewRef.current?.scrollTo({ y: closestY, animated: false });
    }
  };

  // onContentSizeChange fires after ALL child onLayout events, so yOffsets is fully
  // populated and the ScrollView knows its total height — the right moment to scroll.
  const handleContentSizeChange = () => {
    if (!pendingReaderAnchorRef.current) return;
    if (contentSizeTimerRef.current) clearTimeout(contentSizeTimerRef.current);
    // Small debounce: onContentSizeChange can fire multiple times as images decode.
    contentSizeTimerRef.current = setTimeout(() => {
      if (!pendingReaderAnchorRef.current) return;
      performScrollToPage(pendingReaderAnchorRef.current);
    }, 80);
  };

  useEffect(() => {
    if (isReadingMode) {
      yOffsets.current = {};
    }
  }, [isReadingMode]);

  // Safety net: fires 1 s after entering reader mode in case onContentSizeChange
  // never triggers (e.g. the book text was already cached and no size change fires).
  useEffect(() => {
    if (!isReadingMode) return;
    const timer = setTimeout(() => {
      if (!pendingReaderAnchorRef.current) return;
      performScrollToPage(pendingReaderAnchorRef.current);
    }, 1000);
    return () => clearTimeout(timer);
  }, [isReadingMode]);

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

  const handleToggleMode = () => {
    const nextMode = !isReadingMode;
    console.log(`[ReaderScreen] handleToggleMode triggered. Next Mode: ${nextMode ? 'Reader' : 'PDF'}. Current Page: ${currentPage}`);

    if (nextMode) {
      yOffsets.current = {};
      console.log(`[ReaderScreen] Toggle Mode setting pendingReaderAnchorRef to page:`, currentPage);
      pendingReaderAnchorRef.current = currentPage.toString();
      hasScrolledToAnchorRef.current = false; // reset scroll flag
    } else {
      console.log(`[ReaderScreen] Toggle Mode clearing pendingReaderAnchorRef.`);
      pendingReaderAnchorRef.current = null;
    }

    setIsReadingMode(nextMode);
  };



  const handleScroll = (event: any) => {
    if (pendingReaderAnchorRef.current) return;
    if (!isReadingMode) return;
    
    const scrollY = event.nativeEvent.contentOffset.y;
    
    let bestPage = currentPage;
    let maxY = -1;
    for (const [pageStr, yPos] of Object.entries(yOffsets.current)) {
        if (yPos <= scrollY + 100 && yPos > maxY) {
            maxY = yPos;
            bestPage = parseInt(pageStr, 10);
        }
    }
    
    if (bestPage !== currentPage && bestPage > 0) {
      setCurrentPage(bestPage);
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
                onPress={() => {
                  pendingReaderAnchorRef.current = currentPage.toString();
                  hasScrolledToAnchorRef.current = false;
                  setFontSizeMultiplier(prev => Math.max(0.5, prev - 0.2));
                }}
                style={styles.fontBtn}
              >
                <ZoomOut color="#ccc" size={18} />
              </Pressable>
              <Pressable 
                onPress={() => {
                  pendingReaderAnchorRef.current = currentPage.toString();
                  hasScrolledToAnchorRef.current = false;
                  setFontSizeMultiplier(prev => Math.min(3.0, prev + 0.2));
                }}
                style={styles.fontBtn}
              >
                <ZoomIn color="#ccc" size={18} />
              </Pressable>
            </View>
          )}

          <Pressable 
            style={styles.modeToggle}
            onPress={handleToggleMode}
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
                onContentSizeChange={handleContentSizeChange}
              >
                <Markdown 
                  rules={{
                    paragraph: (node, children, parent, styles) => {
                      let rawText = '';
                      if (node.children && Array.isArray(node.children)) {
                          rawText = node.children.map((c: any) => c.content || '').join('').trim();
                      } else if (node.content) {
                          rawText = node.content.trim();
                      }
                      
                      const pageMatch = rawText.match(/\[%%%PAGE_(\d+)%%%\]/);
                      
                      if (pageMatch) {
                          const pNo = pageMatch[1];
                          return (
                            <View 
                              key={node.key}
                              onLayout={(e) => {
                                  yOffsets.current[pNo] = e.nativeEvent.layout.y;
                              }}
                            >
                              <View style={{ marginVertical: 32, alignItems: 'center', opacity: 0.5 }}>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>
                                  — PAGE {pNo} —
                                </Text>
                              </View>
                            </View>
                          );
                      }

                      return (
                        <View key={node.key} style={{ marginBottom: 16 }}>
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
    paddingHorizontal: 0
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 100,
  },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width,
    backgroundColor: '#111',
  }
});
