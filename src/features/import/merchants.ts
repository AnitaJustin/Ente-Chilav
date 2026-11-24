// What the app already knows about common merchants, so most payments get a sensible category with no
// effort. Everything here only ever *suggests*: you always see and can change the category before saving.
// It uses the built-in categories only; if you've hidden one, the app falls back to "Other".

export type KeywordGroup = { category: string; words: string[] };

// Payments you made (money out)
export const DEBIT_KEYWORDS: KeywordGroup[] = [
  { category: 'Food & Dining', words: [
    'swiggy', 'zomato', 'restaurant', 'restaurants', 'cafe', 'coffee', 'starbucks', 'mcdonalds', 'mcdonald', 'kfc',
    'dominos', 'pizza hut', 'pizza', 'burger king', 'burger', 'subway', 'biryani', 'bakery', 'sweets', 'juice', 'chai',
    'tea', 'dhaba', 'eatery', 'food', 'kitchen', 'tiffin', 'canteen', 'haldiram', 'haldirams', 'third wave', 'blue tokai',
    'chaayos', 'truffles', 'faasos', 'behrouz', 'box8', 'ccd', 'dunkin', 'baskin robbins', 'ice cream', 'barbeque nation',
    'eatfit', 'sagar ratna', 'saravana bhavan',
  ] },
  { category: 'Groceries', words: [
    'blinkit', 'zepto', 'bigbasket', 'big basket', 'dmart', 'd mart', 'grofers', 'instamart', 'swiggy instamart',
    'supermarket', 'super market', 'mart', 'provision', 'provisions', 'grocery', 'groceries', 'vegetables', 'fruits',
    'milk', 'dairy', 'reliance fresh', 'reliance smart', 'more retail', 'spencers', 'natures basket', 'jiomart', 'licious',
    'country delight', 'kirana', 'general store', '7 eleven', '7eleven', 'freshtohome', 'ratnadeep', 'star bazaar',
    'big bazaar', 'bazaar',
  ] },
  { category: 'Transport', words: [
    'uber', 'ola', 'ola cabs', 'rapido', 'namma yatri', 'meru', 'cab', 'cabs', 'taxi', 'metro', 'bmtc', 'ksrtc', 'msrtc',
    'bus', 'fastag', 'toll', 'parking', 'petrol', 'diesel', 'fuel', 'bpcl', 'hpcl', 'iocl', 'indian oil', 'bharat petroleum',
    'hindustan petroleum', 'shell', 'nayara', 'cng', 'blusmart', 'auto', 'metro card',
  ] },
  { category: 'Travel', words: [
    'irctc', 'makemytrip', 'goibibo', 'redbus', 'indigo', 'air india', 'vistara', 'akasa', 'spicejet', 'airlines', 'airways',
    'airport', 'oyo', 'yatra', 'cleartrip', 'ixigo', 'booking com', 'airbnb', 'treebo', 'railway', 'railways',
  ] },
  { category: 'Shopping', words: [
    'amazon', 'amazon pay', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'tata cliq', 'croma', 'decathlon', 'lifestyle',
    'westside', 'pantaloons', 'shoppers stop', 'max fashion', 'h m', 'zara', 'ikea', 'lenskart', 'firstcry', 'bata', 'titan',
    'tanishq', 'reliance digital', 'vijay sales', 'shopping', 'fashion', 'mall',
  ] },
  { category: 'Bills & Utilities', words: [
    'jio', 'jio fiber', 'jio prepaid', 'jio recharge', 'airtel', 'vodafone', 'vi', 'bsnl', 'electricity', 'bescom', 'kseb',
    'msedcl', 'tneb', 'tangedco', 'bses', 'tata power', 'adani electricity', 'water board', 'bwssb', 'gas', 'indane',
    'bharat gas', 'hp gas', 'broadband', 'act fibernet', 'hathway', 'excitel', 'recharge', 'postpaid', 'prepaid', 'dth',
    'tata play', 'dish tv', 'sun direct', 'bbps', 'billpay', 'municipal', 'property tax', 'lic', 'insurance', 'premium',
  ] },
  { category: 'Rent & Home', words: [
    'rent', 'landlord', 'maintenance', 'society', 'apartment', 'housing', 'urban company', 'urbanclap', 'plumber',
    'electrician', 'furniture', 'pepperfry', 'home centre',
  ] },
  { category: 'Entertainment', words: [
    'bookmyshow', 'pvr', 'inox', 'cinema', 'cinemas', 'movie', 'movies', 'theatre', 'gaming', 'steam', 'playstation', 'xbox',
    'dream11', 'mpl', 'concert', 'amusement', 'pub',
  ] },
  { category: 'Health', words: [
    'pharmacy', 'pharma', 'apollo', 'apollo pharmacy', 'medplus', '1mg', 'tata 1mg', 'pharmeasy', 'netmeds', 'hospital',
    'clinic', 'doctor', 'dr', 'diagnostic', 'diagnostics', 'lab', 'labs', 'thyrocare', 'lal path', 'healthians', 'dental',
    'dentist', 'optical', 'opticals', 'medical', 'medicals', 'medico', 'chemist', 'cult fit', 'cultfit', 'gym', 'fitness',
    'yoga', 'practo',
  ] },
  { category: 'Education', words: [
    'udemy', 'coursera', 'byju', 'byjus', 'unacademy', 'school', 'college', 'university', 'tuition', 'coaching', 'fees',
    'exam', 'vedantu', 'upgrad', 'skillshare', 'stationery', 'bookstore',
  ] },
  { category: 'Subscriptions', words: [
    'netflix', 'spotify', 'prime video', 'amazon prime', 'hotstar', 'disney', 'youtube', 'youtube premium', 'jiosaavn',
    'gaana', 'apple', 'icloud', 'google one', 'google play', 'google storage', 'microsoft', 'office 365', 'canva', 'chatgpt',
    'openai', 'adobe', 'notion', 'zee5', 'sonyliv', 'sony liv', 'audible', 'kindle', 'subscription', 'membership', 'jiocinema',
  ] },
  { category: 'Investments', words: [
    'zerodha', 'groww', 'upstox', 'kuvera', 'paytm money', 'angel one', 'icici direct', 'hdfc securities', 'mutual fund',
    'sip', 'nps', 'ppf', 'stock', 'stocks', 'demat', 'smallcase', 'etf', 'bonds', 'fixed deposit', 'recurring deposit',
  ] },
  { category: 'Cash withdrawal', words: ['atm', 'atm withdrawal', 'cash withdrawal', 'cash wdl'] },
];

// Money you received
export const CREDIT_KEYWORDS: KeywordGroup[] = [
  { category: 'Salary', words: ['salary', 'payroll', 'wages', 'stipend', 'pension'] },
  { category: 'Other income', words: ['interest', 'refund', 'cashback', 'reversal', 'dividend', 'bonus', 'reward', 'freelance'] },
];

// Words that mean a name belongs to a business, not a person.
export const BUSINESS_WORDS = new Set([
  'india', 'indian', 'bank', 'pay', 'store', 'stores', 'mart', 'fresh', 'coffee', 'cafe', 'day', 'wave', 'recharge', 'prepaid',
  'postpaid', 'technologies', 'tech', 'solutions', 'services', 'service', 'enterprises', 'traders', 'trading', 'pharmacy',
  'medical', 'medicals', 'hospital', 'clinic', 'hotel', 'restaurant', 'bakery', 'sweets', 'super', 'market', 'mobile',
  'electronics', 'fuel', 'petrol', 'gas', 'agency', 'agencies', 'associates', 'company', 'co', 'ltd', 'pvt', 'private',
  'limited', 'llp', 'inc', 'corp', 'foods', 'food', 'kitchen', 'pizza', 'burger', 'cinema', 'theatre', 'airlines',
  'airways', 'travels', 'tours', 'cabs', 'taxi', 'metro', 'card', 'shop', 'mall', 'center', 'centre', 'hub', 'online',
  'digital', 'payments', 'payment', 'wallet', 'money', 'finance', 'insurance', 'school', 'college', 'academy', 'institute',
  'university', 'gym', 'fitness', 'salon', 'spa', 'laundry', 'cleaners', 'repair', 'works', 'industries', 'motors', 'auto',
  'petro', 'dairy', 'farm', 'organic', 'natural', 'general', 'provision', 'provisions', 'medico', 'chemist', 'opticals',
  'jewellers', 'jewelers', 'gold', 'textiles', 'fashion', 'garments', 'boutique', 'electricals', 'hardware', 'books',
  'stationery', 'xerox', 'printers', 'studio', 'photo', 'events', 'catering', 'caterers', 'bazaar', 'bazar', 'supermarket',
  'department', 'dept', 'recharge', 'bill', 'bills', 'refund', 'credit', 'interest', 'salary', 'withdrawal', 'atm',
  'transfer', 'unknown', 'subscription', 'membership', 'fees', 'rent', 'society', 'maintenance',
]);
