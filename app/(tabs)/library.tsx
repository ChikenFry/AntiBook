import React from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Plus, BookOpen } from 'lucide-react-native';
import { useLibrary } from '../../lib/LibraryContext';

export default function LibraryScreen() {
  const router = useRouter();
  const { books, addBook, updateBookText } = useLibrary();
  const [loading, setLoading] = React.useState(false);

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        // Ensure they actually picked a PDF
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          Alert.alert("Invalid File", "Please pick a .PDF document!");
          return;
        }
        const newBookId = Math.random().toString(36).substr(2, 9);
        
        // Add skeleton
        addBook({
          id: newBookId,
          title: file.name,
          uri: file.uri,
        });

        // Background parse via Localhost Python Backend
        setLoading(true);
        try {
          const formData = new FormData();
          formData.append('file', {
            uri: file.uri,
            type: 'application/pdf',
            name: file.name,
          } as any);
          formData.append('book_id', newBookId);

          const res = await fetch('http://localhost:8000/extract', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error("Backend extraction failed");
          const data = await res.json();
          
          updateBookText(newBookId, data.text || "Unable to extract text.", data.page_anchors);
        } catch (err) {
          console.error("Extraction error:", err);
          updateBookText(newBookId, "Error extracting text natively via Python.", undefined);
        }
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  const renderBook = ({ item }: { item: any }) => (
    <View style={styles.bookCard}>
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.bookStatus}>
          {item.text ? "Ready to Read" : "Processing..."}
        </Text>
      </View>
      <View style={styles.actionRow}>
        <Pressable 
          style={[styles.miniBtn, !item.text && styles.miniBtnDisabled]}
          onPress={() => item.text && router.push({ pathname: '/reader', params: { id: item.id } })}
        >
          <BookOpen color="#fff" size={16} />
          <Text style={styles.miniBtnText}>Read</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {books.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Your Library is Empty</Text>
          <Text style={styles.emptySub}>Upload a PDF to start reading.</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={renderBook}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Processing Book...</Text>
        </View>
      )}

      <Pressable style={styles.fab} onPress={handleUpload}>
        <Plus color="#111" size={20} />
        <Text style={{color: '#111', fontWeight: 'bold', marginLeft: 8}}>Upload PDF</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  bookCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  bookInfo: {
    marginBottom: 16,
  },
  bookTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  bookStatus: {
    color: '#888',
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  miniBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  miniBtnAlt: {
    backgroundColor: '#fff',
  },
  miniBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  miniBtnDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: '#888',
    fontSize: 16,
    marginBottom: 20,
  },
  demoBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  demoBtnText: {
    color: '#000',
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: '#fff',
    height: 60,
    paddingHorizontal: 24,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontWeight: '500',
  }
});
