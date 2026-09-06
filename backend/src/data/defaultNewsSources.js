/**
 * Sources News par défaut (10 sites de départ IA / Big Data).
 * Copié dans la base au premier démarrage si la collection NewsSource est vide.
 */
const DEFAULT_NEWS_SOURCES = [
  { name: 'Google Cloud Blog', url: 'https://cloud.google.com/blog/fr' },
  {
    name: 'AWS News Blog (IA)',
    url: 'https://aws.amazon.com/blogs/aws/category/artificial-intelligence/amazon-machine-learning/',
  },
  { name: 'GeeksforGeeks', url: 'https://www.geeksforgeeks.org' },
  { name: 'KDnuggets', url: 'https://www.kdnuggets.com' },
  { name: 'FreeCodeCamp News', url: 'https://www.freecodecamp.org/news' },
  { name: 'Analytics Vidhya', url: 'https://www.analyticsvidhya.com/blog/' },
  { name: 'Hugging Face Papers', url: 'https://huggingface.co/papers' },
  { name: 'MIT News (IA)', url: 'https://news.mit.edu/topic/artificial-intelligence2' },
  { name: 'Towards Data Science', url: 'https://towardsdatascience.com' },
  { name: 'Google Developers Blog', url: 'https://developers.googleblog.com' },
];

module.exports = { DEFAULT_NEWS_SOURCES };
