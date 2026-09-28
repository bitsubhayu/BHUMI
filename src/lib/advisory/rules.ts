/**
 * BHUMI Authoritative Verified Advisory Rules Registry
 *
 * Sourced from ICAR-CRIDA, AICRPAM, and KVK Kharif Contingency Guidelines.
 * Encodes verified agronomic actions and pre-translated multilingual templates
 * across 10 regional Indian languages.
 */

import type { AdvisoryRuleRow } from '@/lib/supabase/types';

export const VERIFIED_ADVISORY_RULES: AdvisoryRuleRow[] = [
  // ==========================================
  // GENERAL KHARIF CONTINGENCY RULES (ICAR-CRIDA)
  // ==========================================
  {
    rule_code: 'ICAR-CRIDA-DELAY-01',
    action_type: 'delay_sowing',
    crop_category: 'general',
    trigger_condition: 'break_probability >= 50 AND lead_time_bucket IN (week_1, week_2)',
    english_title: 'Delay Kharif Sowing Advisory',
    english_recommendation:
      'High probability of dry break spell detected during the early vegetative window. Withhold direct sowing or nursery transplanting until continuous rainfall revival is confirmed to prevent seedling desiccation and germination failure.',
    suggested_measures: [
      'Postpone sowing operations until a minimum 50-75 mm cumulative rainfall spell is received.',
      'Keep short-duration or drought-tolerant seed varieties ready for contingency planting.',
      'Ensure seed drill and farm implements are pre-calibrated for rapid sowing once monsoon revives.',
    ],
    icar_reference_code: 'ICAR-CRIDA-KHARIF-STD-01',
    localized_templates: {
      hi: {
        title: 'बुवाई स्थगित करने की सलाह',
        recommendation:
          'शुरुआती वानस्पतिक चरण में शुष्क अंतराल (ड्राई ब्रेक) की उच्च संभावना है। बीजों को सूखने और अंकुरण विफलता से बचाने के लिए निरंतर मानसूनी वर्षा की पुष्टि होने तक बुवाई स्थगित रखें।',
        suggested_measures: [
          'कम से कम 50-75 मिमी संचयी वर्षा होने तक बुवाई रोकें।',
          'कम अवधि वाली या सूखा-सहिष्णु किस्मों के बीज तैयार रखें।',
          'वर्षा शुरू होते ही तुरंत बुवाई के लिए कृषि उपकरण तैयार रखें।',
        ],
      },
      mr: {
        title: 'खरीप पेरणी लांबणीवर टाकण्याचा सल्ला',
        recommendation:
          'सुरुवातीच्या वाढीच्या टप्प्यात पावसाचा मोठा खंड पडण्याची दाट शक्यता आहे. बियाणे वाया जाणे व उगवण अपयशी ठरणे टाळण्यासाठी पाऊस पुन्हा नियमित सुरू होईपर्यंत पेरणी तात्पुरती थांबवा.',
        suggested_measures: [
          'जमिनीत किमान 50 ते 75 मिमी पाऊस पडून पुरेशी ओल झाल्याशिवाय पेरणी करू नका.',
          'कमी कालावधीच्या किंवा अवर्षणप्रतिकारक वाणांचे बियाणे पर्यायी नियोजनासाठी सज्ज ठेवा.',
          'पाऊस पुन्हा सक्रिय झाल्यावर तातडीने पेरणी करण्यासाठी पेरणी यंत्र तयार ठेवा.',
        ],
      },
      te: {
        title: 'విత్తనాలు వేయడం వాయిదా వేయండి',
        recommendation:
          'మొలకెత్తే దశలో వర్షాభావం లేదా సుదీర్ఘ పొడి కాలం ఏర్పడే అవకాశం ఉంది. విత్తనాలు మొలకెత్తక ఎండిపోకుండా ఉండేందుకు వర్షాలు మళ్లీ ప్రారంభమయ్యే వరకు విత్తనాలు వేయడం వాయిదా వేయండి.',
        suggested_measures: [
          'కనీసం 50-75 మి.మీ వర్షపాతం నమోదయ్యే వరకు విత్తనాలు వేయవద్దు.',
          'స్వల్పకాలిక లేదా కరువును తట్టుకునే విత్తన రకాలను అందుబాటులో ఉంచుకోండి.',
          'వర్షం పడిన వెంటనే వేగంగా విత్తడానికి పరికరాలను సిద్ధంగా ఉంచండి.',
        ],
      },
      ta: {
        title: 'விதைப்பை ஒத்திவைக்க ஆலோசனை',
        recommendation:
          'ஆரம்ப கட்டத்தில் கடுமையான வறண்ட வானிலை நிலவ வாய்ப்புள்ளது. முளைப்புத் திறன் பாதிப்பு மற்றும் நாற்றுக்கள் காய்ந்து போவதைத் தவிர்க்க தொடர் மழை உறுதி செய்யப்படும் வரை விதைப்பை ஒத்திவைக்கவும்.',
        suggested_measures: [
          'குறைந்தது 50-75 மி.மீ மழை பெய்யும் வரை விதைப்புப் பணிகளைத் தொடங்க வேண்டாம்.',
          'குறுகிய கால அல்லது வறட்சியைத் தாங்கும் மாற்று விதை ரகங்களை தயார் நிலையில் வைக்கவும்.',
          'மழை தொடங்கியவுடன் உடனே விதைக்க விதைப்புக் கருவிகளைச் சரிசெய்து வைக்கவும்.',
        ],
      },
      bn: {
        title: 'খরিফ বপন স্থগিত রাখার পরামর্শ',
        recommendation:
          'প্রাথমিক বৃদ্ধির পর্যায়ে দীর্ঘ অনাবৃষ্টির প্রবল আশঙ্কা রয়েছে। বীজের অঙ্কুরোদগম ব্যর্থতা ও চারা নষ্ট হওয়া রোধে পুনরায় পর্যাপ্ত বৃষ্টিপাত নিশ্চিত না হওয়া পর্যন্ত বপন কাজ স্থগিত রাখুন।',
        suggested_measures: [
          'কমপক্ষে ৫০-৭৫ মিমি বৃষ্টিপাত না হওয়া পর্যন্ত বীজ বপন করবেন না।',
          'জরুরি পরিস্থিতির জন্য স্বল্পমেয়াদী বা খরা-সহনশীল জাতের বীজ মজুত রাখুন।',
          'বৃষ্টি শুরু হওয়া মাত্র দ্রুত বপনের জন্য কৃষি যন্ত্রপাতি প্রস্তুত রাখুন।',
        ],
      },
      gu: {
        title: 'ખરીફ વાવણી મોકૂફ રાખવાની કૃષિ સલાહ',
        recommendation:
          'પાકની શરૂઆતની અવસ્થામાં લાંબા વરસાદી વિરામની શક્યતા છે. બિયારણ બળી જતું અટકાવવા અને યોગ્ય અંકુરણ માટે વરસાદ ફરી સક્રિય ન થાય ત્યાં સુધી વાવણી મુલતવી રાખો.',
        suggested_measures: [
          'જમીનમાં 50-75 મીમી જેટલો પૂરતો વરસાદ ન થાય ત્યાં સુધી વાવણી અટકાવો.',
          'ઓછા સમયગાળાની અથવા સૂકારક્ષી જાતોના બિયારણ સ્ટેન્ડબાય રાખો.',
          'વરસાદ થતાં જ તુરંત વાવણી કરવા સાધનો તૈયાર રાખો.',
        ],
      },
      kn: {
        title: 'ಬಿತ್ತನೆ ಮುಂದೂಡುವ ಕೃಷಿ ಎಚ್ಚರಿಕೆ',
        recommendation:
          'ಬೆಳೆಯ ಆರಂಭಿಕ ಹಂತದಲ್ಲಿ ಮಳೆಯ ಕೊರತೆ ಉಂಟಾಗುವ ಸಾಧ್ಯತೆಯಿದೆ. ಬೀಜ ಒಣಗಿ ಹಾಳಾಗುವುದನ್ನು ತಪ್ಪಿಸಲು ನಿರಂತರ ಮಳೆ ಆರಂಭವಾಗುವವರೆಗೆ ಬಿತ್ತನೆಯನ್ನು ಮುಂದೂಡಿ.',
        suggested_measures: [
          'ಕನಿಷ್ಠ 50-75 ಮಿ.ಮೀ ಮಳೆಯಾಗುವವರೆಗೆ ಬಿತ್ತನೆ ಮಾಡಬೇಡಿ.',
          'ಕಡಿಮೆ ಅವಧಿಯ ಅಥವಾ ಬರ ನಿರೋಧಕ ತಳಿಗಳ ಬೀಜಗಳನ್ನು ಸಿದ್ಧವಾಗಿಟ್ಟುಕೊಳ್ಳಿ.',
          'ಮಳೆ ಪುನರಾರಂಭಗೊಂಡ ಕೂಡಲೇ ಬಿತ್ತನೆ ಮಾಡಲು ಉಪಕರಣಗಳನ್ನು ಸಿದ್ಧಪಡಿಸಿ.',
        ],
      },
      pa: {
        title: 'ਬਿਜਾਈ ਮੁਲਤਵੀ ਕਰਨ ਦੀ ਸਲਾਹ',
        recommendation:
          'ਮੁੱਢਲੇ ਵਾਧੇ ਦੌਰਾਨ ਲੰਬੇ ਖੁਸ਼ਕ ਦੌਰ ਦਾ ਖਦਸ਼ਾ ਹੈ। ਬੀਜ ਦੇ ਖਰਾਬ ਹੋਣ ਤੋਂ ਬਚਾਅ ਲਈ ਮਾਨਸੂਨੀ ਮੀਂਹ ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਹੋਣ ਤੱਕ ਬਿਜਾਈ ਰੋਕ ਕੇ ਰੱਖੋ।',
        suggested_measures: [
          'ਘੱਟੋ-ਘੱਟ 50-75 ਮਿਲੀਮੀਟਰ ਬਾਰਿਸ਼ ਹੋਣ ਤੱਕ ਬਿਜਾਈ ਨਾ ਕਰੋ।',
          'ਘੱਟ ਸਮੇਂ ਵਾਲੀਆਂ ਜਾਂ ਸੋਕਾ-ਸਹਿਣਸ਼ੀਲ ਕਿਸਮਾਂ ਦੇ ਬੀਜ ਤਿਆਰ ਰੱਖੋ।',
          'ਮੀਂਹ ਪੈਂਦੇ ਹੀ ਤੁਰੰਤ ਬਿਜਾਈ ਲਈ ਖੇਤੀ ਮਸ਼ੀਨਰੀ ਤਿਆਰ ਰੱਖੋ।',
        ],
      },
      or: {
        title: 'ବୁଣାବୁଣି ସ୍ଥଗିତ ରଖିବା ପରାମର୍ଶ',
        recommendation:
          'ପ୍ରାରମ୍ଭିକ ବୃଦ୍ଧି ସମୟରେ ବର୍ଷା ଅଭାବ ହେବାର ଆଶଙ୍କା ରହିଛି। ଗଜା ନଷ୍ଟ ହେବାରୁ ରକ୍ଷା କରିବା ପାଇଁ ନିୟମିତ ବର୍ଷା ଆରମ୍ଭ ନହେବା ପର୍ଯ୍ୟନ୍ତ ବିହନ ବୁଣିବା ବନ୍ଦ ରଖନ୍ତୁ।',
        suggested_measures: [
          'ଅତି କମରେ ୫୦-୭୫ ମିମି ବର୍ଷା ନହେବା ଯାଏଁ ବୁଣା କାର୍ଯ୍ୟ ଆରମ୍ଭ କରନ୍ତୁ ନାହିଁ।',
          'କମ ଦିନିଆ କିମ୍ବା ମରୁଡ଼ି ସହଣୀୟ ବିହନ କିସମ ପ୍ରସ୍ତୁତ ରଖନ୍ତୁ।',
          'ବର୍ଷା ହେବା କ୍ଷଣି ତୁରନ୍ତ ବୁଣିବା ପାଇଁ ଯନ୍ତ୍ରପାତି ପ୍ରସ୍ତୁତ ରଖନ୍ତୁ।',
        ],
      },
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    rule_code: 'ICAR-CRIDA-IRRIG-01',
    action_type: 'prepare_irrigation',
    crop_category: 'general',
    trigger_condition: 'break_probability >= 40',
    english_title: 'Supplemental Irrigation Preparedness',
    english_recommendation:
      'Elevated probability of deficient rainfall and extended dry break spell. Mobilize farm pond storage, borewell connections, and micro-irrigation systems to protect standing Kharif crops against critical soil moisture deficit.',
    suggested_measures: [
      'Service pump sets, check valve seals, and clear drip/sprinkler laterals.',
      'Prioritize life-saving protective irrigation for crops in flowering or pod-filling stages.',
      'Apply organic residue or straw mulching in crop inter-rows to retard soil moisture loss.',
    ],
    icar_reference_code: 'ICAR-CRIDA-KHARIF-STD-02',
    localized_templates: {
      hi: {
        title: 'पूरक सिंचाई तैयारी सलाह',
        recommendation:
          'कम वर्षा और लंबे शुष्क अंतराल की संभावना है। खड़ी फसलों को नमी के संकट से बचाने के लिए खेत तालाब (फार्म पॉन्ड) और सूक्ष्म सिंचाई उपकरणों को तैयार रखें।',
        suggested_measures: [
          'पंप सेटों और ड्रिप/स्प्रिंकलर पाइपों की तुरंत सर्विसिंग करें।',
          'फूल आने या दाना भरने की अवस्था वाली फसलों को जीवन रक्षक सिंचाई प्राथमिकता पर दें।',
          'नमी बनाए रखने के लिए पंक्तियों के बीच पुआल या फसल अवशेषों की मल्चिंग करें।',
        ],
      },
      mr: {
        title: 'संरक्षित सिंचनाची पूर्वतयारी',
        recommendation:
          'पावसात मोठा खंड पडण्याची शक्यता असल्याने जमिनीतील ओलावा वेगाने कमी होऊ शकतो. उभ्या पिकांना ओलाव्याचा ताण बसू नये म्हणून शेततळे, विहीर व सूक्ष्म सिंचन यंत्रणा सज्ज ठेवा.',
        suggested_measures: [
          'ठिबक व तुषार सिंचन संच तसेच कृषी पंप सुस्थितीत असल्याची खात्री करा.',
          'पिके फुलोऱ्यात किंवा दाणे भरण्याच्या नाजूक अवस्थेत असल्यास संरक्षित पाणी देण्यास प्राधान्य द्या.',
          'जमिनीतील बाष्पीभवन रोखण्यासाठी पिकांच्या ओळींमध्ये सेंद्रिय अवशेषांचे आच्छादन (मल्चिंग) करा.',
        ],
      },
      te: {
        title: 'రక్షక నీటిపారుదల సన్నద్ధత',
        recommendation:
          'వర్షపాత లోటు మరియు పొడి వాతావరణం ఏర్పడే ప్రమాదం ఉన్నందున పంటలకు నీటి ఎద్దడి రాకుండా ఫారమ్ పాండ్ మరియు సూక్ష్మ నీటిపారుదల వనరులను సిద్ధం చేసుకోండి.',
        suggested_measures: [
          'స్ప్రింక్లర్ మరియు డ్రిప్ పరికరాలను పరీక్షించి సిద్ధంగా ఉంచుకోండి.',
          'పూత మరియు గింజ పాలుపోసుకునే దశలో ఉన్న పంటలకు ప్రాణరక్షక నీరు అందించండి.',
          'నేలలో తేమను కాపాడటానికి పంట అవశేషాలతో మల్చింగ్ చేయండి.',
        ],
      },
      ta: {
        title: 'துணை நீர்ப்பாசன தயார்நிலை',
        recommendation:
          'நீண்ட வறண்ட இடைவெளி நிலவக்கூடும் என்பதால் நிலத்தடி நீர் மற்றும் பண்ணைக் குட்டை நீரைப் பயன்படுத்தி பயிர்களைக் காப்பாற்ற நுண்ணீர்ப் பாசனத்தை தயார் செய்யவும்.',
        suggested_measures: [
          'மின்மோட்டார்கள், தெளிப்பான் மற்றும் சொட்டுநீர்க் குழாய்களைச் சீரமைக்கவும்.',
          'பூக்கும் மற்றும் காய் பிடிக்கும் பருவத்தில் உள்ள பயிர்களுக்கு உயிர்த் தண்ணீர் பாய்ச்சவும்.',
          'மண்ணின் ஈரப்பதத்தைத் தக்கவைக்க பயிர் எச்சங்களைக் கொண்டு மூடாக்கு இடவும்.',
        ],
      },
      bn: {
        title: 'সম্পূরক সেচ প্রস্তুতি',
        recommendation:
          'বৃষ্টিহীন শুষ্ক আবহাওয়ার কারণে জমিতে আর্দ্রতার তীব্র সংকট হতে পারে। ফসলের সুরক্ষায় খামার পুকুর ও ড্রিপ/স্প্রিংকলার সেচ ব্যবস্থা অবিলম্বে কার্যকর করুন।',
        suggested_measures: [
          'পাম্প সেট এবং স্প্রিংকলার পাইপলাইন দ্রুত পরীক্ষা করে সচল রাখুন।',
          'ফুল ও দানা গঠনের সংবেদনশীল পর্যায়ে থাকা ফসলে জীবনদায়ী সেচ দিন।',
          'মাটির আর্দ্রতা ধরে রাখতে ফসলের সারির মাঝে খড় বা পাতার মালচিং প্রয়োগ করুন।',
        ],
      },
      gu: {
        title: 'પૂરક પિયત માટે આગોતરી તૈયારી',
        recommendation:
          'વરસાદની અછતને લીધે ઊભા પાકને ભેજની ખેંચ પડી શકે છે. પાકને બચાવવા માટે ખેત તલાવડી, બોરવેલ અને ટપક પિયત સાધનો સત્વરે તૈયાર રાખો.',
        suggested_measures: [
          'પંપ સેટ અને ડ્રિપ/સ્પ્રિંકલર પાઇપો ચકાસી લો.',
          'ફૂલ કે દાણા ભરાવવાની નાજુક અવસ્થામાં જીવનરક્ષક પિયત આપો.',
          'જમીનમાં ભેજ ટકાવી રાખવા માટે પાકના અવશેષોનું મલ્ચિંગ કરો.',
        ],
      },
      kn: {
        title: 'ಪೂರಕ ನೀರಾವರಿ ಸಿದ್ಧತೆ',
        recommendation:
          'ಮಳೆ ಕೊರತೆಯಿಂದಾಗಿ ತೇವಾಂಶದ ಕೊರತೆ ಎದುರಾಗಬಹುದು. ಬೆಳೆಗಳನ್ನು ರಕ್ಷಿಸಲು ಕೃಷಿ ಹೊಂಡ, ಕೊಳವೆಬಾವಿ ಮತ್ತು ಹನಿ ನೀರಾವರಿ ಸಾಧನಗಳನ್ನು ಸಿದ್ಧವಾಗಿಟ್ಟುಕೊಳ್ಳಿ.',
        suggested_measures: [
          'ಪಂಪ್‌ಸೆಟ್‌ಗಳು ಮತ್ತು ಹನಿ/ತುಂತುರು ನೀರಾವರಿ ಪೈಪ್‌ಗಳನ್ನು ದುರಸ್ತಿ ಮಾಡಿಟ್ಟುಕೊಳ್ಳಿ.',
          'ಹೂವಾಡುವ ಅಥವಾ ಕಾಳು ಕಟ್ಟುವ ಹಂತದಲ್ಲಿರುವ ಬೆಳೆಗೆ ಜೀವ ರಕ್ಷಕ ನೀರು ನೀಡಿ.',
          'ತೇವಾಂಶ ಸಂರಕ್ಷಣೆಗಾಗಿ ಸಾಲುಗಳ ನಡುವೆ ಸಾವಯವ ತ್ಯಾಜ್ಯದಿಂದ ಹೊದಿಕೆ (ಮಲ್ಚಿಂಗ್) ಮಾಡಿ.',
        ],
      },
      pa: {
        title: 'ਸਹਾਇਕ ਸਿੰਚਾਈ ਦੀ ਤਿਆਰੀ',
        recommendation:
          'ਸੋਕੇ ਦੇ ਹਾਲਾਤਾਂ ਕਾਰਨ ਖੜ੍ਹੀਆਂ ਫਸਲਾਂ ਨੂੰ ਪਾਣੀ ਦੀ ਘਾਟ ਪੈ ਸਕਦੀ ਹੈ। ਖੇਤ ਤਲਾਬ ਅਤੇ ਤੁਪਕਾ ਸਿੰਚਾਈ ਪ੍ਰਣਾਲੀ ਨੂੰ ਤੁਰੰਤ ਕਾਰਜਸ਼ੀਲ ਕਰੋ।',
        suggested_measures: [
          'ਟਿਊਬਵੈੱਲ ਅਤੇ ਫੁਹਾਰਾ ਸਿੰਚਾਈ ਯੰਤਰਾਂ ਦੀ ਸਰਵਿਸ ਕਰਵਾਓ।',
          'ਫੁੱਲ ਪੈਣ ਜਾਂ ਦਾਣੇ ਬਣਨ ਸਮੇਂ ਫਸਲ ਨੂੰ ਬਚਾਉਣ ਲਈ ਪਹਿਲ ਦੇ ਆਧਾਰ ਤੇ ਸਿੰਚਾਈ ਕਰੋ।',
          'ਨਮੀ ਬਚਾਉਣ ਲਈ ਫਸਲ ਦੀਆਂ ਲਾਈਨਾਂ ਵਿਚਕਾਰ ਰਹਿੰਦ-ਖੂੰਹਦ ਦੀ ਮਲਚਿੰਗ ਕਰੋ।',
        ],
      },
      or: {
        title: 'ଜଳସେଚନ ପାଇଁ ପ୍ରସ୍ତୁତ ରୁହନ୍ତୁ',
        recommendation:
          'ଦୀର୍ଘ ଶୁଷ୍କ ପାଗ ଯୋଗୁଁ ଫସଲରେ ଜଳାଭାବ ଦେଖାଦେଇପାରେ। ଫସଲକୁ ସୁରକ୍ଷା ଦେବା ପାଇଁ ପୋଖରୀ ଓ ବୁନ୍ଦା ଜଳସେଚନ ବ୍ୟବସ୍ଥା ସଜାଗ ରଖନ୍ତୁ।',
        suggested_measures: [
          'ପମ୍ପ ସେଟ୍ ଏବଂ ସ୍ପ୍ରିଙ୍କଲର ଯନ୍ତ୍ରାଂଶ ଯାଞ୍ଚ କରି ପ୍ରସ୍ତୁତ ରଖନ୍ତୁ।',
          'ଫୁଲ ଫୁଟିବା କିମ୍ବା ଦାନା ହେବା ସମୟରେ ଜରୁରୀକାଳୀନ ପାଣି ମଡ଼ାନ୍ତୁ।',
          'ମାଟିର ଆର୍ଦ୍ରତା ରକ୍ଷା ପାଇଁ ପାଳ କିମ୍ବା ଶୁଖିଲା ଘାସର ଆବରଣ (ମଲଚିଂ) ଦିଅନ୍ତୁ।',
        ],
      },
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    rule_code: 'ICAR-CRIDA-DRAIN-01',
    action_type: 'drainage_alert',
    crop_category: 'general',
    trigger_condition: 'heavy_spell_probability >= 40',
    english_title: 'Field Drainage & Waterlogging Alert',
    english_recommendation:
      'High probability of heavy precipitation spells. Open field bunds and clear natural drainage channels to drain standing excess water, preventing root asphyxiation and damping-off diseases.',
    suggested_measures: [
      'Create drainage trenches and unclog bund spillways across all lowland plots.',
      'Postpone top-dressing of nitrogen fertilizers and foliar pesticide sprays prior to heavy downpour.',
      'Check seedlings and crops for waterborne fungal infections once floodwaters recede.',
    ],
    icar_reference_code: 'ICAR-CRIDA-KHARIF-STD-03',
    localized_templates: {
      hi: {
        title: 'जल निकासी एवं जलभराव चेतावनी',
        recommendation:
          'भारी वर्षा के दौर की उच्च संभावना है। खेत की मेड़ों के निकास खोलें और नालियों को साफ करें ताकि अतिरिक्त पानी निकल सके और फसलों की जड़ें गलने से बचें।',
        suggested_measures: [
          'निचले खेतों में जलनिकासी के लिए नालियां बनाएं और मेड़ों को खोलें।',
          'भारी बारिश से पहले यूरिया खाद का छिड़काव और कीटनाशक स्प्रे स्थगित करें।',
          'पानी उतरने के बाद फफूंदजनित रोगों की निगरानी करें।',
        ],
      },
      mr: {
        title: 'पाण्याचा निचरा व पूरस्थिती सतर्कता इशारा',
        recommendation:
          'मुसळधार पावसाची शक्यता असल्याने शेतात पाणी साचून पिकांची मुळे कुजण्याचा धोका आहे. शेतातील पाण्याचा निचरा होण्यासाठी तातडीने चर खोदा व बांधांचे निकास मोकळे करा.',
        suggested_measures: [
          'सखल भागातील शेतातून जास्तीचे पाणी बाहेर काढण्यासाठी चर काढून पाणी वाहते करा.',
          'मुसळधार पाऊस थांबेपर्यंत रासायनिक खतांचा डोस किंवा कीटकनाशक फवारणी थांबवा.',
          'पाणी ओसरल्यानंतर पिकांवर बुरशीनाशकाची योग्य फवारणी करा.',
        ],
      },
      te: {
        title: 'మురుగు నీటి నివారణ హెచ్చరిక',
        recommendation:
          'భారీ వర్షాలు కురిసే అవకాశం ఉన్నందున పొలంలో నీరు నిల్వ ఉండకుండా కాలువలను శుభ్రం చేసి అదనపు నీటిని వెంటనే బయటకు పంపండి.',
        suggested_measures: [
          'పొలం గట్ల వద్ద నీరు బయటకు వెళ్లే దారులను తెరవండి.',
          'భారీ వర్షానికి ముందు ఎరువులు మరియు పురుగుమందుల పిచికారీ నిలిపివేయండి.',
          'నీరు తగ్గిన తర్వాత తెగుళ్ల నివారణ చర్యలు చేపట్టండి.',
        ],
      },
      ta: {
        title: 'வடிகால் மற்றும் வெள்ள அபாய எச்சரிக்கை',
        recommendation:
          'கனமழை பெய்ய வாய்ப்புள்ளதால் பயிர்கள் மூழ்குவதைத் தடுக்கவும் வேரழுகல் நோயைத் தவிர்க்கவும் வயலில் இருந்து உபரி நீரை உடனடியாக வடிக்கவும்.',
        suggested_measures: [
          'வயல் வரப்புகளில் வடிகால் வழிகளை ஏற்படுத்தி நீரை வெளியேற்றவும்.',
          'மழைக்கு முன் உரம் இடுவதையோ அல்லது பூச்சிக்கொல்லி தெளிப்பதையோ தவிர்க்கவும்.',
          'வெள்ள நீர் வடிந்ததும் பூஞ்சாணத் தாக்குதலைக் கண்காணிக்கவும்.',
        ],
      },
      bn: {
        title: 'নিকাশি ও জলাবদ্ধতা সতর্কতা',
        recommendation:
          'ভারী বর্ষণের প্রবল সম্ভাবনা রয়েছে। জমিতে জল জমে ফসলের শিকড় পচে যাওয়া রোধ করতে আইলের মুখ খুলে অতিরিক্ত জল বের করে দিন।',
        suggested_measures: [
          'নিচু জমিতে নালা কেটে জল নিষ্কাশনের ব্যবস্থা করুন।',
          'ভারী বৃষ্টির পূর্বে জমিতে কোনো রাসায়নিক সার বা কীটনাশক স্প্রে করবেন না।',
          'জল নেমে যাওয়ার পর ছত্রাকঘটিত রোগের আক্রমণ পরীক্ষা করুন।',
        ],
      },
      gu: {
        title: 'પાણીના નિકાલ અને જળબંબાકારની ચેતવણી',
        recommendation:
          'ભારે વરસાદની આગાહી હોવાથી ખેતરમાં પાણી ભરાઈ રહેવાથી મૂળ સડવાનો ભય રહે છે. ખેતરમાંથી વધારાના પાણીના નિકાલ માટે પાળાના મુખ ખોલો.',
        suggested_measures: [
          'નીચાણવાળા ખેતરોમાં નીતાર નિકાલ નહેરો તાકીદે ખોદો.',
          'વરસાદ પહેલાં ખાતર આપવાનું કે દવા છંટકાવ કરવાનું ટાળો.',
          'પાણી ઊતર્યા બાદ ફૂગજન્ય રોગો સામે યોગ્ય પગલાં લો.',
        ],
      },
      kn: {
        title: 'ಜಮೀನಿನಿಂದ ನೀರು ಬಸಿದುಹೋಗುವ ಎಚ್ಚರಿಕೆ',
        recommendation:
          'ಭಾರೀ ಮಳೆಯಾಗುವ ಸಾಧ್ಯತೆಯಿರುವುದರಿಂದ ಜಮೀನಿನಲ್ಲಿ ನೀರು ನಿಂತು ಬೇರು ಕೊಳೆಯದಂತೆ ಬದುಗಳ ಕಾಲುವೆಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ ಹೆಚ್ಚುವರಿ ನೀರನ್ನು ಹೊರಹಾಕಿ.',
        suggested_measures: [
          'ತಗ್ಗು ಪ್ರದೇಶದ ಜಮೀನುಗಳಲ್ಲಿ ಬಸಿಗಾಲುವೆಗಳನ್ನು ನಿರ್ಮಿಸಿ.',
          'ಮಳೆಯ ಮುಂಚಿತವಾಗಿ ರಸಗೊಬ್ಬರ ಅಥವಾ ಕೀಟನಾಶಕ ಸಿಂಪಡಿಸಬೇಡಿ.',
          'ನೀರು ಇಳಿದ ನಂತರ ಶಿಲೀಂಧ್ರ ರೋಗಗಳ ಲಕ್ಷಣಗಳನ್ನು ಗಮನಿಸಿ.',
        ],
      },
      pa: {
        title: 'ਪਾਣੀ ਦੀ ਨਿਕਾਸੀ ਸੰਬੰਧੀ ਚੇਤਾਵਨੀ',
        recommendation:
          'ਭਾਰੀ ਮੀਂਹ ਦੇ ਖਦਸ਼ੇ ਕਾਰਨ ਖੇਤਾਂ ਵਿੱਚ ਪਾਣੀ ਖੜ੍ਹਨ ਨਾਲ ਜੜ੍ਹਾਂ ਗਲਣ ਦਾ ਡਰ ਹੈ। ਵਾਧੂ ਪਾਣੀ ਦੇ ਨਿਕਾਸ ਲਈ ਖਾਲਾਂ ਅਤੇ ਬੰਨ੍ਹਾਂ ਨੂੰ ਤੁਰੰਤ ਸਾਫ਼ ਕਰੋ।',
        suggested_measures: [
          'ਨੀਵੇਂ ਖੇਤਾਂ ਵਿੱਚੋਂ ਪਾਣੀ ਕੱਢਣ ਲਈ ਨਿਕਾਸੀ ਨਾਲੀਆਂ ਬਣਾਓ।',
          'ਤੇਜ਼ ਮੀਂਹ ਤੋਂ ਪਹਿਲਾਂ ਯੂਰੀਆ ਜਾਂ ਕੀਟਨਾਸ਼ਕਾਂ ਦਾ ਛਿੜਕਾਅ ਨਾ ਕਰੋ।',
          'ਪਾਣੀ ਉਤਰਨ ਉਪਰੰਤ ਉੱਲੀ ਰੋਗਾਂ ਦੀ ਜਾਂਚ ਕਰੋ।',
        ],
      },
      or: {
        title: 'ଜଳ ନିଷ୍କାସନ ସତର୍କତା',
        recommendation:
          'ପ୍ରବଳ ବର୍ଷା ହେବାର ସମ୍ଭାବନା ଥିବାରୁ ଜମିରେ ପାଣି ଜମି ଚେର ସଢ଼ିବା ଆଶଙ୍କା ରହିଛି। ଜମିରୁ ଅତିରିକ୍ତ ଜଳ ନିଷ୍କାସନ ପାଇଁ ହିଡ଼ର କାଟି ନାଳି ସଫା କରନ୍ତୁ।',
        suggested_measures: [
          'ଖାଲୁଆ ଜମିରେ ନିଷ୍କାସନ ନାଳି ଖୋଳି ପାଣି ବାହାର କରନ୍ତୁ।',
          'ଭାରୀ ବର୍ଷା ପୂର୍ବରୁ ସାର ଓ କୀଟନାଶକ ପ୍ରୟୋଗ ସ୍ଥଗିତ ରଖନ୍ତୁ।',
          'ପାଣି ଛାଡ଼ିବା ପରେ କବକ ରୋଗର ନିରାକରଣ କରନ୍ତୁ।',
        ],
      },
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    rule_code: 'ICAR-CRIDA-SOW-01',
    action_type: 'safe_to_sow',
    crop_category: 'general',
    trigger_condition: 'onset_probability >= 50 AND break_probability <= 30',
    english_title: 'Favorable Monsoon Sowing Window',
    english_recommendation:
      'Active monsoon onset conditions with sustained rainfall probability support optimal root-zone seedbed moisture. Proceed with certified Kharif seed sowing in properly prepared land.',
    suggested_measures: [
      'Treat seeds with recommended bio-fertilizers (Rhizobium/PSB/Trichoderma) prior to sowing.',
      'Maintain depth and spacing per state agriculture university package of practices.',
      'Apply recommended basal fertilizer dose based on soil health card parameters.',
    ],
    icar_reference_code: 'ICAR-CRIDA-KHARIF-STD-04',
    localized_templates: {
      hi: {
        title: 'खरीफ बुवाई के लिए अनुकूल मौसम',
        recommendation:
          'सक्रिय मानसून और पर्याप्त वर्षा की संभावना से मिट्टी में अनुकूल नमी उपलब्ध है। अच्छी तरह तैयार खेतों में प्रमाणित बीजों से खरीफ बुवाई शुरू करें।',
        suggested_measures: [
          'बुवाई से पहले बीजों का उपयुक्त जैव-उर्वरकों से उपचार अवश्य करें।',
          'कृषि विश्वविद्यालय की सिफारिश अनुसार उचित गहराई और दूरी पर बुवाई करें।',
          'मृदा स्वास्थ्य कार्ड के आधार पर संतुलित आधारभूत खाद डालें।',
        ],
      },
      mr: {
        title: 'खरीप पेरणीसाठी अनुकूल हवामान',
        recommendation:
          'मान्सूनचे आगमन समाधानकारक असून जमिनीत पेरणीयोग्य वाफसा तयार झाला आहे. चांगल्या मशागत केलेल्या शेतात प्रमाणित बियाण्यांची पेरणी सुरू करा.',
        suggested_measures: [
          'पेरणीपूर्वी बियाण्यास ट्रायको Welfare किंवा जिवाणू संवर्धकाची बीजप्रक्रिया करा.',
          'कृषी विद्यापीठाने शिफारस केलेल्या योग्य अंतरावर व खोलीवर पेरणी करा.',
          'माती परीक्षणानुसार खतांचा शिफारशीत पहिला हप्ता (बेसल डोस) द्या.',
        ],
      },
      te: {
        title: 'విత్తనాలు వేయడానికి అనుకూల సమయం',
        recommendation:
          'సకాలంలో వర్షాలు కురవడంతో నేలలో సరిపడా తేమ ఉంది. సిద్ధం చేసిన పొలాలలో నాణ్యమైన విత్తనాలతో ఖరీఫ్ విత్తనాలు వేయడం ప్రారంభించండి.',
        suggested_measures: [
          'విత్తే ముందు తప్పనిసరిగా విత్తన శుద్ధి చేసుకోండి.',
          'సిఫార్సు చేసిన లోతు మరియు దూరంలో విత్తనాలు వేయండి.',
          'నేల స్వభావానికి అనుగుణంగా ఎరువులను వేయండి.',
        ],
      },
      ta: {
        title: 'விதைப்புக்கு உகந்த காலம்',
        recommendation:
          'பருவமழை சாதகமாக உள்ளதால் மண்ணில் நல்ல ஈரப்பதம் உள்ளது. உரிய முறையில் நிலத்தைத் தயார் செய்து சான்றுபெற்ற விதைகளைக் கொண்டு விதைப்பைத் தொடங்கலாம்.',
        suggested_measures: [
          'விதைப்பதற்கு முன் உயிர் உரங்கள் கொண்டு விதை நேர்த்தி செய்யவும்.',
          'பரிந்துரைக்கப்பட்ட இடைவெளியில் விதைகளை விதைக்கவும்.',
          'மண் பரிசோதனைக்கு ஏற்ப அடி உரங்களை இடவும்.',
        ],
      },
      bn: {
        title: 'খরিফ বীজ বপনের অনুকূল আবহাওয়া',
        recommendation:
          'বর্ষার অনুকূল প্রভাবে জমিতে উপযুক্ত আর্দ্রতা তৈরি হয়েছে। সঠিকভাবে প্রস্তুত জমিতে শোধিত বীজ বপন শুরু করুন।',
        suggested_measures: [
          'বপনের পূর্বে উপযুক্ত ছত্রাকনাশক বা জৈব সার দিয়ে বীজ শোধন করুন।',
          'কৃষি বিশেষজ্ঞদের নির্ধারিত গভীরতা ও দূরত্ব মেনে বীজ বপন করুন।',
          'মাটি পরীক্ষার রিপোর্ট অনুযায়ী প্রাথমিক সার প্রয়োগ করুন।',
        ],
      },
      gu: {
        title: 'વાવણી માટે અનુકૂળ મોસમ',
        recommendation:
          'ચોમાસાની સમયસર શરૂઆતથી જમીનમાં પૂરતો ભેજ સંગ્રહાયો છે. તૈયાર કરેલા ખેતરમાં પ્રમાણિત બીજ સાથે ખરીફ પાકની વાવણી શરૂ કરો.',
        suggested_measures: [
          'વાવણી પૂર્વે બીજ માવજત (બીજ સંસ્કાર) અચૂક કરો.',
          'ભલામણ કરેલ યોગ્ય અંતર અને ઊંડાઈએ વાવણી કરો.',
          'જમીન ચકાસણી મુજબ પાયાનું ખાતર આપો.',
        ],
      },
      kn: {
        title: 'ಬಿತ್ತನೆಗೆ ಪ್ರಶಸ್ತವಾದ ಸಮಯ',
        recommendation:
          'ಮುಂಗಾರು ಮಳೆ ಸಮರ್ಪಕವಾಗಿದ್ದು ಮಣ್ಣಿನಲ್ಲಿ ಹದವಾದ ತೇವಾಂಶವಿದೆ. ಸಿದ್ಧಪಡಿಸಿದ ಜಮೀನಿನಲ್ಲಿ ಪ್ರಮಾಣೀಕೃತ ಬೀಜಗಳನ್ನು ಬಿತ್ತನೆ ಮಾಡಿ.',
        suggested_measures: [
          'ಬಿತ್ತನೆಗೆ ಮುನ್ನ ಶಿಫಾರಸು ಮಾಡಿದ ಜೈವಿಕ ಗೊಬ್ಬರಗಳಿಂದ ಬೀಜೋಪಚಾರ ಮಾಡಿ.',
          'ಸೂಕ್ತ ಅಂತರ ಮತ್ತು ಆಳದಲ್ಲಿ ಬಿತ್ತನೆ ಕಾರ್ಯ ಕೈಗೊಳ್ಳಿ.',
          'ಮಣ್ಣು ಪರೀಕ್ಷಾ ಆಧಾರದ ಮೇಲೆ ಶಿಫಾರಸು ಮಾಡಿದ ರಸಗೊಬ್ಬರ ನೀಡಿ.',
        ],
      },
      pa: {
        title: 'ਬਿਜਾਈ ਲਈ ਅਨੁਕੂਲ ਮੌਸਮ',
        recommendation:
          'ਮਾਨਸੂਨ ਦੀ ਆਮਦ ਨਾਲ ਜ਼ਮੀਨ ਵਿੱਚ ਪੂਰਾ ਵੱਤਰ ਹੈ। ਤਿਆਰ ਕੀਤੇ ਖੇਤਾਂ ਵਿੱਚ ਤਸਦੀਕਸ਼ੁਦਾ ਬੀਜਾਂ ਦੀ ਬਿਜਾਈ ਸ਼ੁਰੂ ਕਰੋ।',
        suggested_measures: [
          'ਬਿਜਾਈ ਤੋਂ ਪਹਿਲਾਂ ਬੀਜ ਦੀ ਸੋਧ ਜ਼ਰੂਰ ਕਰੋ।',
          'ਸਿਫਾਰਸ਼ ਕੀਤੀ ਡੂੰਘਾਈ ਅਤੇ ਫਾਸਲੇ ਤੇ ਬਿਜਾਈ ਕਰੋ।',
          'ਮਿੱਟੀ ਟੈਸਟ ਅਨੁਸਾਰ ਮੁੱਢਲੀ ਖਾਦ ਪਾਓ।',
        ],
      },
      or: {
        title: 'ବିହନ ବୁଣିବା ପାଇଁ ଉତ୍ତମ ସମୟ',
        recommendation:
          'ମୌସୁମୀ ପ୍ରଭାବରେ ମାଟିରେ ଆବଶ୍ୟକୀୟ ଆର୍ଦ୍ରତା ରହିଛି। ଜମି ପ୍ରସ୍ତୁତ କରି ବିଶୋଧିତ ବିହନ ବୁଣିବା ଆରମ୍ଭ କରନ୍ତୁ।',
        suggested_measures: [
          'ବୁଣିବା ପୂର୍ବରୁ ବିହନ ବିଶୋଧନ ଅବଶ୍ୟ କରନ୍ତୁ।',
          'ନିର୍ଦ୍ଧାରିତ ଦୂରତା ଓ ଗଭୀରତାରେ ବିହନ ବୁଣନ୍ତୁ।',
          'ମାଟି ପରୀକ୍ଷା ଆଧାରରେ ପ୍ରାରମ୍ଭିକ ଖତସାର ପ୍ରୟୋଗ କରନ୍ତୁ।',
        ],
      },
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    rule_code: 'ICAR-CRIDA-MONITOR-01',
    action_type: 'monitor_conditions',
    crop_category: 'general',
    trigger_condition: 'default',
    english_title: 'Normal Seasonal Monitoring',
    english_recommendation:
      'Monsoon probability indices are within seasonal climatological bounds. Proceed with scheduled field operations, intercultural weeding, and monitor upcoming weekly lead advisories.',
    suggested_measures: [
      'Maintain routine field scouting for early pest infestation and fungal symptoms.',
      'Undertake manual weeding or mechanical hoeing to improve soil aeration.',
      'Check weekly multi-model lead forecasts for emerging break transitions.',
    ],
    icar_reference_code: 'ICAR-CRIDA-KHARIF-STD-05',
    localized_templates: {
      hi: {
        title: 'सामान्य मौसमी निगरानी',
        recommendation:
          'मौसम संबंधी जोखिम सूचकांक सामान्य सीमा में हैं। नियमित निराई-गुड़ाई एवं कृषि कार्य जारी रखें तथा आगामी साप्ताहिक मौसम पूर्वानुमान पर नजर रखें।',
        suggested_measures: [
          'कीट-रोगों की रोकथाम के लिए खेतों का नियमित निरीक्षण करें।',
          'निराई-गुड़ाई कर खरपतवार नियंत्रित करें।',
          'आगामी सप्ताह के मौसम पूर्वानुमान को ध्यानपूर्वक देखें।',
        ],
      },
      mr: {
        title: 'सामान्य हंगामी देखरेख व व्यवस्थापन',
        recommendation:
          'हवामानाचे अंदाज सर्वसाधारण मर्यादेत आहेत. शेतातील नेहमीची आंतरमशागत, खुरपणी चालू ठेवा आणि पुढील आठवड्याच्या सुधारित हवामान अंदाजावर लक्ष ठेवा.',
        suggested_measures: [
          'कीड व रोगांचा प्रादुर्भाव तपासण्यासाठी पिकांचे नियमित निरीक्षण करा.',
          'तण नियंत्रणासाठी कोळपणी व खुरपणीची कामे वेळेवर पूर्ण करा.',
          'पुढील हवामान बदलांविषयीच्या सुधारित सूचना पाहत राहा.',
        ],
      },
      te: {
        title: 'సాధారణ పర్యవేక్షణ',
        recommendation:
          'వాతావరణ పరిస్థితులు సాధారణంగా ఉన్నాయి. సాధారణ సాగు పనులు కొనసాగించండి మరియు రాబోయే వారాల వాతావరణ సమాచారాన్ని గమనిస్తూ ఉండండి.',
        suggested_measures: [
          'చీడపీడల గుర్తింపు కోసం పంటలను క్రమం తప్పకుండా పరిశీలించండి.',
          'కలుపు నివారణ చర్యలు చేపట్టండి.',
          'వాతావరణ మార్పులను ఎప్పటికప్పుడు తెలుసుకోండి.',
        ],
      },
      ta: {
        title: 'வழக்கமான கண்காணிப்பு',
        recommendation:
          'வானிலை இயல்பு நிலையில் உள்ளது. வழக்கமான களை எடுப்பு மற்றும் களப்பணிகளைத் தொடரவும், அடுத்த வார முன்னறிவிப்பைக் கவனிக்கவும்.',
        suggested_measures: [
          'பூச்சி மற்றும் நோய் தாக்குதலைத் தவறாமல் கண்காணிக்கவும்.',
          'களை நிர்வாகப் பணிகளை மேற்கொள்ளவும்.',
          'அடுத்த கட்ட வானிலை அறிவிப்புகளைத் தொடர்ந்து கவனிக்கவும்.',
        ],
      },
      bn: {
        title: 'স্বাভাবিক পর্যবেক্ষণ ও পরিচর্যা',
        recommendation:
          'আবহাওয়া পরিস্থিতি স্বাভাবিক মাত্রায় রয়েছে। সাধারণ চাষের কাজ, নিড়ানি ও আগাছা দমন চালিয়ে যান এবং পরবর্তী আবহাওয়ার পূর্বাভাস পর্যবেক্ষণ করুন।',
        suggested_measures: [
          'পোকা ও রোগের আক্রমণের জন্য নিয়মিত জমি পরিদর্শন করুন।',
          'সময়মতো আগাছা পরিষ্কারের কাজ সম্পন্ন করুন।',
          'পরবর্তী সপ্তাহের আবহাওয়ার পূর্বাভাসের প্রতি খেয়াল রাখুন।',
        ],
      },
      gu: {
        title: 'સામાન્ય મોસમી દેખરેખ',
        recommendation:
          'હવામાન સૂચકાંકો સામાન્ય સીમામાં છે. નિયમિત નીંદામણ અને આંતરખેડ ચાલુ રાખો તેમજ આગામી સાપ્તાહિક આગાહી પર નજર રાખો.',
        suggested_measures: [
          'જીવાત અને રોગના ઉપદ્રવ માટે પાકનું નિરીક્ષણ કરો.',
          'નીંદામણ નિયંત્રણની કામગીરી સમયસર કરો.',
          'આગામી હવામાન આગાહીઓ તપાસતા રહો.',
        ],
      },
      kn: {
        title: 'ಸಾಮಾನ್ಯ ಬೆಳೆ ನಿರ್ವಹಣೆ',
        recommendation:
          'ಹವಾಮಾನ ಪರಿಸ್ಥಿತಿಗಳು ಸಾಮಾನ್ಯ ಮಿತಿಯಲ್ಲಿದೆ. ಸಾಂಪ್ರದಾಯಿಕ ಕೃಷಿ ಚಟುವಟಿಕೆಗಳು ಮತ್ತು ಕಳೆ ಕೀಳುವ ಕೆಲಸವನ್ನು ಮುಂದುವರಿಸಿ ಮುಂದಿನ ವಾರದ ಮುನ್ಸೂಚನೆಯನ್ನು ಗಮನಿಸಿ.',
        suggested_measures: [
          'ಕೀಟ ಮತ್ತು ರೋಗ ಬಾಧೆಗಳಿಗಾಗಿ ಬೆಳೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.',
          'ಸಕಾಲದಲ್ಲಿ ಕಳೆ ನಿಯಂತ್ರಣ ಕಾರ್ಯಗಳನ್ನು ಕೈಗೊಳ್ಳಿ.',
          'ಮುಂದಿನ ಹವಾಮಾನ ಮುನ್ಸೂಚನೆಗಳನ್ನು ಗಮನಿಸುತ್ತಿರಿ.',
        ],
      },
      pa: {
        title: 'ਆਮ ਮੌਸਮੀ ਨਿਗਰਾਨੀ',
        recommendation:
          'ਮੌਸਮ ਦੇ ਹਾਲਾਤ ਆਮ ਹਨ। ਨਦੀਨਾਂ ਦੀ ਰੋਕਥਾਮ ਅਤੇ ਆਮ ਖੇਤੀ ਕੰਮ ਜਾਰੀ ਰੱਖੋ ਅਤੇ ਅਗਲੇ ਹਫ਼ਤੇ ਦੀ ਮੌਸਮ ਜਾਣਕਾਰੀ ਤੇ ਨਜ਼ਰ ਰੱਖੋ।',
        suggested_measures: [
          'ਕੀੜਿਆਂ-ਮਕੌੜਿਆਂ ਦੀ ਰੋਕਥਾਮ ਲਈ ਫਸਲਾਂ ਦਾ ਨਿਰੀਖਣ ਕਰੋ।',
          'ਗੋਡੀ ਕਰਕੇ ਨਦੀਨਾਂ ਨੂੰ ਕੰਟਰੋਲ ਕਰੋ।',
          'ਆਉਣ ਵਾਲੇ ਮੌਸਮ ਦੇ ਅਨੁਮਾਨਾਂ ਵੱਲ ਧਿਆਨ ਦਿਓ।',
        ],
      },
      or: {
        title: 'ସାଧାରଣ ଫସଲ ତଦାରଖ',
        recommendation:
          'ପାଣିପାଗ ସ୍ଥିତି ସ୍ୱାଭାବିକ ରହିଛି। ନିୟମିତ ଘାସ ବଛା ଓ କୃଷି କାର୍ଯ୍ୟ ଜାରି ରଖନ୍ତୁ ଏବଂ ପରବର୍ତ୍ତୀ ସପ୍ତାହର ପୂର୍ବାନୁମାନ ଦେଖନ୍ତୁ।',
        suggested_measures: [
          'ରୋଗପୋକ ନିୟନ୍ତ୍ରଣ ପାଇଁ ନିୟମିତ କ୍ଷେତ ପରିଦର୍ଶନ କରନ୍ତୁ।',
          'ଘାସ ବାଛି ଜମି ସଫା ରଖନ୍ତୁ।',
          'ପରବର୍ତ୍ତୀ ପାଣିପାଗ ସତର୍କତା ଉପରେ ଦୃଷ୍ଟି ରଖନ୍ତୁ।',
        ],
      },
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },

  // ==========================================
  // CROP-SPECIFIC KHARIF ADVISORY RULES
  // ==========================================
  // PADDY (Rice)
  {
    rule_code: 'ICAR-NRRI-PAD-DRAIN-01',
    action_type: 'drainage_alert',
    crop_category: 'paddy',
    trigger_condition: 'heavy_spell_probability >= 40',
    english_title: 'Paddy Waterlogging & Submergence Alert',
    english_recommendation:
      'Heavy rainfall anticipated. Maintain standing water level in paddy fields below 5 cm for young transplanted seedlings. Clear bund drainage notches to avoid submerged seedling rot.',
    suggested_measures: [
      'Regulate bund spillways to prevent submergence of newly transplanted seedlings.',
      'Withhold nitrogen top-dressing until high-intensity rainfall subsides.',
      'Check for bacterial leaf blight risk once excess water is drained.',
    ],
    icar_reference_code: 'ICAR-NRRI-CRIDA-01',
    localized_templates: {
      hi: 'धान के खेतों में जलस्तर 5 सेमी से नीचे बनाए रखने के लिए मेड़ों के निकास खोलें ताकि रोपाई किए गए नए पौधे डूबकर खराब न हों।',
      mr: 'भाताच्या खाचरात नव्याने लावणी केलेल्या रोपांना धोका टाळण्यासाठी शेतातील पाण्याची पातळी ५ सेंमी पेक्षा कमी ठेवा व जास्तीचे पाणी काढून द्या.',
      te: 'వరి పొలాల్లో నీటి మట్టాన్ని 5 సెం.మీ కంటే తక్కువగా ఉంచండి, మురుగు నీటిని బయటకు పంపండి.',
      ta: 'நெல் பயிரில் அதிக நீர் தேங்குவதைத் தவிர்க்க வரப்புகளில் வடிகால் வசதி செய்து அதிகப்படியான நீரை வெளியேற்றவும்.',
      bn: 'ধানের জমিতে জলস্তর ৫ সেমি-এর নিচে রাখতে অতিরিক্ত জল নিকাশের ব্যবস্থা করুন যাতে কচি চারা পচে না যায়।',
      gu: 'ડાંગરના ખેતરમાં પાણીની સપાટી 5 સેમીથી નીચે રાખવા વધારાના પાણીનો નિકાલ કરો.',
      kn: 'ಭತ್ತದ ಗದ್ದೆಯಲ್ಲಿ ನೀರು 5 ಸೆಂ.ಮೀ ಗಿಂತ ಹೆಚ್ಚು ನಿಲ್ಲದಂತೆ ಹೆಚ್ಚುವರಿ ನೀರನ್ನು ಹೊರಹಾಕಿ.',
      pa: 'ਝੋਨੇ ਦੇ ਖੇਤ ਵਿੱਚ ਪਾਣੀ ਦਾ ਪੱਧਰ 5 ਸੈਂਟੀਮੀਟਰ ਤੋਂ ਘੱਟ ਰੱਖਣ ਲਈ ਵਾਧੂ ਪਾਣੀ ਬਾਹਰ ਕੱਢੋ।',
      or: 'ଧାନ ଜମିରେ ୫ ସେମିରୁ ଅଧିକ ପାଣି ଜମିବାକୁ ନଦେଇ ନିଷ୍କାସନ ବ୍ୟବସ୍ଥା କରନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    rule_code: 'ICAR-NRRI-PAD-DELAY-01',
    action_type: 'delay_sowing',
    crop_category: 'paddy',
    trigger_condition: 'break_probability >= 50 AND lead_time_bucket IN (week_1, week_2)',
    english_title: 'Paddy Transplanting Deferral Advisory',
    english_recommendation:
      'Dry break spell approaching. Postpone nursery uprooting and main-field transplanting until assured irrigation or rainfall resumption is established.',
    suggested_measures: [
      'Maintain nursery seedlings in moist condition with light protective watering.',
      'Do not puddle main field prematurely to avoid hard pan cracking.',
    ],
    icar_reference_code: 'ICAR-NRRI-CRIDA-02',
    localized_templates: {
      hi: 'वर्षा में खंड के कारण धान की रोपाई स्थगित करें और नर्सरी में हल्की सिंचाई बनाए रखें।',
      mr: 'पावसाचा खंड असल्यामुळे भात रोपांची पुनर्लागवड पुढे ढकला आणि रोपवाटिकेत हलके पाणी द्या.',
      te: 'వర్షాలు లేనందున వరి నాట్లు వేయడం వాయిదా వేయండి.',
      ta: 'வறண்ட வானிலை காரணமாக நெல் நாற்று நடவை ஒத்திவைக்கவும்.',
      bn: 'অনাবৃষ্টির কারণে ধানের চারা রোপণ আপাতত স্থগিত রাখুন।',
      gu: 'ડાંગરની ફેરરોપણી થોડા દિવસ મુલતવી રાખો.',
      kn: 'ಮಳೆಯ ಕೊರತೆ ಇರುವುದರಿಂದ ಭತ್ತದ ಸಸಿ ನಾಟಿ ಮಾಡುವುದನ್ನು ಮುಂದೂಡಿ.',
      pa: 'ਝੋਨੇ ਦੀ ਲਵਾਈ ਕੁਝ ਦਿਨਾਂ ਲਈ ਮੁਲਤਵੀ ਕਰੋ।',
      or: 'ବର୍ଷା ଅଭାବରୁ ଧାନ ରୁଆ କାର୍ଯ୍ୟ ସ୍ଥଗିତ ରଖନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    rule_code: 'ICAR-NRRI-PAD-SOW-01',
    action_type: 'safe_to_sow',
    crop_category: 'paddy',
    trigger_condition: 'onset_probability >= 50 AND break_probability <= 30',
    english_title: 'Favorable Paddy Transplanting Window',
    english_recommendation:
      'Abundant rainfall and soil saturation expected. Proceed with main-field puddling and transplanting 20-25 day old rice seedlings.',
    suggested_measures: [
      'Transplant 2-3 seedlings per hill at 20x15 cm spacing.',
      'Incorporate basal dose of DAP/NPK during final puddling.',
    ],
    icar_reference_code: 'ICAR-NRRI-CRIDA-03',
    localized_templates: {
      hi: 'धान की रोपाई और लेह लगाने (कदवा करने) के लिए मौसम उपयुक्त है। 20-25 दिन के पौधों की रोपाई करें।',
      mr: 'भात खाचरांमध्ये चिखलणी करून २०-२५ दिवसांच्या निरोगी रोपांची पुनर्लागण सुरू करण्यास अनुकूल हवामान.',
      te: 'వరి నాట్లు వేయడానికి అనుకూల సమయం, 20-25 రోజుల నారును నాటండి.',
      ta: 'நெல் நடவு செய்ய உகந்த காலம். 20-25 நாள் நாற்றுக்களை நடவு செய்யவும்.',
      bn: 'ধানের চারা রোপণের জন্য আদর্শ সময়। ২০-২৫ দিনের চারা রোপণ করুন।',
      gu: 'ડાંગરની ફેરરોપણી કરવા માટે અનુકૂળ સમય છે.',
      kn: 'ಭತ್ತದ ನಾಟಿ ಮಾಡಲು ಪ್ರಶಸ್ತ ಸಮಯ, 20-25 ದಿನದ ಸಸಿಗಳನ್ನು ನಾಟಿ ಮಾಡಿ.',
      pa: 'ਝੋਨੇ ਦੀ ਪਨੀਰੀ ਲਾਉਣ ਲਈ ਢੁਕਵਾਂ ਸਮਾਂ ਹੈ।',
      or: 'ଧାନ ରୁଆ ପାଇଁ ଅନୁକୂଳ ସମୟ, ୨୦-୨୫ ଦିନର ତଳି ରୁଅନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },

  // SOYBEAN
  {
    rule_code: 'ICAR-IISR-SOY-DRAIN-01',
    action_type: 'drainage_alert',
    crop_category: 'soybean',
    trigger_condition: 'heavy_spell_probability >= 40',
    english_title: 'Soybean Waterlogging Prevention Alert',
    english_recommendation:
      'Soybean is highly susceptible to root asphyxiation under waterlogged conditions. Clear inter-row furrows immediately to ensure no standing water remains longer than 24 hours.',
    suggested_measures: [
      'Open drainage furrows every 4-6 rows to evacuate excess runoff.',
      'Check seedlings for collar rot symptoms after storm passes.',
    ],
    icar_reference_code: 'ICAR-IISR-SOY-01',
    localized_templates: {
      hi: 'सोयाबीन जलभराव के प्रति अत्यंत संवेदनशील है। खेतों से 24 घंटे के भीतर पानी की निकासी सुनिश्चित करें।',
      mr: 'सोयाबीन पिकात पाणी साचल्यास मुळे सडतात, त्यामुळे शेतातून चर काढून २४ तासांच्या आत पाण्याचा निचरा करा.',
      te: 'సోయాబీన్ పొలంలో నీరు నిల్వ ఉండకుండా వెంటనే కాలువలు తీసి నీటిని బయటకు పంపండి.',
      ta: 'சோயாபீன் பயிரில் நீர் தேங்குவதைத் தடுக்க உடனடியாக வடிகால் அமைக்கவும்.',
      bn: 'সয়াবিন জমিতে জল জমতে দেবেন না, দ্রুত জল নিকাশের ব্যবস্থা নিন।',
      gu: 'સોયાબીનમાં પાણી ભરાઈ ન રહે તે માટે તાકીદે નિકાલની વ્યવસ્થા કરો.',
      kn: 'ಸೋಯಾಬೀನ್ ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಬಸಿಗಾಲುವೆಗಳನ್ನು ತೆರೆಯಿರಿ.',
      pa: 'ਸੋਇਆਬੀਨ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਵਾਧੂ ਪਾਣੀ ਤੁਰੰਤ ਬਾਹਰ ਕੱਢੋ।',
      or: 'ସୋୟାବିନ୍ ଜମିରେ ପାଣି ଜମିବାକୁ ନଦେଇ ନିଷ୍କାସନ ନାଳି କାଟନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    rule_code: 'ICAR-IISR-SOY-DELAY-01',
    action_type: 'delay_sowing',
    crop_category: 'soybean',
    trigger_condition: 'break_probability >= 50 AND lead_time_bucket IN (week_1, week_2)',
    english_title: 'Soybean Sowing Deferral Notice',
    english_recommendation:
      'Do not sow soybean in dry or shallow moisture profiles. Minimum 75-100 mm cumulative rainfall is necessary to avoid seed encrustation and failure.',
    suggested_measures: [
      'Withhold sowing until soil moisture is verified to a depth of 10-15 cm.',
      'Keep treated seeds in cool aerated storage.',
    ],
    icar_reference_code: 'ICAR-IISR-SOY-02',
    localized_templates: {
      hi: 'कम नमी में सोयाबीन की बुवाई न करें। कम से कम 75-100 मिमी बारिश होने तक प्रतीक्षा करें।',
      mr: 'जमिनीत किमान ७५-१०० मिमी पाऊस पडून १०-१५ सेंमी खोलीपर्यंत ओलावा असल्याशिवाय सोयाबीन पेरू नका.',
      te: 'తగినంత వర్షం పడే వరకు సోయాబీన్ విత్తనాలు వేయవద్దు.',
      ta: 'போதிய ஈரப்பதம் இல்லாமல் சோயாபீன் விதைக்க வேண்டாம்.',
      bn: 'পর্যাপ্ত আর্দ্রতা না আসা পর্যন্ত সয়াবিন বপন করবেন না।',
      gu: 'જમીનમાં પૂરતો ભેજ ન થાય ત્યાં સુધી સોયાબીન વાવશો નહીં.',
      kn: 'ಸಾಕಷ್ಟು ತೇವಾಂಶ ಬರುವವರೆಗೆ ಸೋಯಾಬೀನ್ ಬಿತ್ತನೆ ಮಾಡಬೇಡಿ.',
      pa: 'ਪੂਰਾ ਵੱਤਰ ਆਉਣ ਤੱਕ ਸੋਇਆਬੀਨ ਦੀ ਬਿਜਾਈ ਨਾ ਕਰੋ।',
      or: 'ପର୍ଯ୍ୟାପ୍ତ ଆର୍ଦ୍ରତା ନଆସିବା ଯାଏଁ ସୋୟାବିନ୍ ବୁଣନ୍ତୁ ନାହିଁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },

  // COTTON
  {
    rule_code: 'ICAR-CICR-COT-DRAIN-01',
    action_type: 'drainage_alert',
    crop_category: 'cotton',
    trigger_condition: 'heavy_spell_probability >= 40',
    english_title: 'Cotton Waterlogging Alert',
    english_recommendation:
      'Heavy rain alert. Drain standing water from cotton furrows within 24 hours to prevent root suffocation, parawilt, and square dropping.',
    suggested_measures: [
      'Open ridge furrows to facilitate gravity drainage in deep black soils.',
      'Spray 1% potassium nitrate (KNO3) if plants show yellowing after drainage.',
    ],
    icar_reference_code: 'ICAR-CICR-COT-01',
    localized_templates: {
      hi: 'कपास के खेतों में पानी जमा न होने दें। 24 घंटे में जल निकासी करें ताकि पौधे पीले न पड़ें।',
      mr: 'कापूस पिकात पाणी साचल्यास उभे झाड सुकण्याची (पॅराव्हिल्ट) शक्यता असते, तातडीने पाणी बाहेर काढा.',
      te: 'పత్తి చేనులో నీరు నిల్వ ఉండకుండా వెంటనే బయటకు పంపండి.',
      ta: 'பருத்தி வயலில் தண்ணீர் தேங்குவதைத் தடுத்து உடனே வடிகால் அமைக்கவும்.',
      bn: 'তুলা ক্ষেতে জল জমতে না দিয়ে দ্রুত বের করে দিন।',
      gu: 'કપાસમાં પાણી ભરાઈ ન રહે તે માટે તાકીદે નીતાર કરો.',
      kn: 'ಹತ್ತಿ ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಬಸಿಗಾಲುವೆ ಮಾಡಿ.',
      pa: 'ਨਰਮੇ/ਕਪਾਹ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਪਾਣੀ ਤੁਰੰਤ ਕੱਢੋ।',
      or: 'କପା ଜମିରୁ ଅତିରିକ୍ତ ପାଣି ତୁରନ୍ତ ବାହାର କରନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },

  // MAIZE
  {
    rule_code: 'ICAR-IIMR-MAI-DRAIN-01',
    action_type: 'drainage_alert',
    crop_category: 'maize',
    trigger_condition: 'heavy_spell_probability >= 40',
    english_title: 'Maize Excess Moisture Alert',
    english_recommendation:
      'Maize is highly sensitive to waterlogging at the knee-high stage. Create furrow drains to discharge runoff rapidly.',
    suggested_measures: ['Keep furrows open between rows to evacuate stormwater.'],
    icar_reference_code: 'ICAR-IIMR-MAI-01',
    localized_templates: {
      hi: 'मक्के की फसल में घुटने तक की अवस्था में जलभराव से भारी नुकसान होता है। तुरंत पानी निकालें।',
      mr: 'मका पीक गुडघाभर उंचीच्या अवस्थेत असताना पाणी साचल्यास मोठे नुकसान होते, पाण्याचा त्वरित निचरा करा.',
      te: 'మొక్కజొన్న పొలంలో నీరు నిల్వ ఉండకుండా జాగ్రత్తపడండి.',
      ta: 'மக்காச்சோள வயலில் தேங்கிய நீரை உடனே வெளியேற்றவும்.',
      bn: 'ভুট্টা ক্ষেতে জল জমতে না দিয়ে অবিলম্বে নিকাশের ব্যবস্থা করুন।',
      gu: 'મકાઈના પાકમાં પાણી ભરાઈ ન રહે તે જોવું.',
      kn: 'ಮೆಕ್ಕೆಜೋಳದ ಗದ್ದೆಯಿಂದ ಹೆಚ್ಚುವರಿ ನೀರನ್ನು ಹೊರಹಾಕಿ.',
      pa: 'ਮੱਕੀ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਪਾਣੀ ਦੀ ਨਿਕਾਸੀ ਯਕੀਨੀ ਬਣਾਓ।',
      or: 'ମକା ଜମିରୁ ତୁରନ୍ତ ପାଣି ନିଷ୍କାସନ କରନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },

  // PULSES
  {
    rule_code: 'ICAR-IIPR-PUL-DRAIN-01',
    action_type: 'drainage_alert',
    crop_category: 'pulses',
    trigger_condition: 'heavy_spell_probability >= 40',
    english_title: 'Kharif Pulses Phytophthora & Waterlogging Alert',
    english_recommendation:
      'Pigeonpea (Arhar) and Greengram (Moong) are vulnerable to Phytophthora blight under waterlogging. Drain excess water without delay.',
    suggested_measures: ['Ensure free drainage in all pulse fields to save root nodules.'],
    icar_reference_code: 'ICAR-IIPR-PUL-01',
    localized_templates: {
      hi: 'अरहर एवं मूंग में जलभराव से उकठा एवं झुलसा रोग फैलता है। खेत से पानी तत्काल निकालें।',
      mr: 'तूर व मूग पिकात पाणी साचल्यास मूळकूज व फायटोप्थोरा रोगाचा प्रादुर्भाव होतो, त्वरित पाण्याचा निचरा करा.',
      te: 'కంది, పెసర పొలాల్లో నీరు నిల్వ ఉండకుండా మురుగు నీటిని తీసివేయండి.',
      ta: 'துவரை, பாசிப்பயறு பயிர்களில் நீர் தேங்காமல் உடனடியாக வடிக்கவும்.',
      bn: 'ডালজাতীয় ফসলের জমিতে জল জমতে দেবেন না, দ্রুত জল বের করে দিন।',
      gu: 'કઠોળ પાકોમાં પાણી ભરાઈ ન રહે તે માટે નિકાલ કરો.',
      kn: 'ತೊಗರಿ ಮತ್ತು ಹೆಸರು ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಹೊರಹಾಕಿ.',
      pa: 'ਦਾਲਾਂ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਵਾਧੂ ਪਾਣੀ ਤੁਰੰਤ ਕੱਢੋ।',
      or: 'ଡାଲି ଜାତୀୟ ଫସଲରୁ ତୁରନ୍ତ ପାଣି ନିଷ୍କାସନ କରନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },

  // GROUNDNUT
  {
    rule_code: 'ICAR-DGR-GND-DRAIN-01',
    action_type: 'drainage_alert',
    crop_category: 'groundnut',
    trigger_condition: 'heavy_spell_probability >= 40',
    english_title: 'Groundnut Collar Rot & Drainage Alert',
    english_recommendation:
      'Excess moisture triggers collar rot and peg decay in groundnut. Open drainage furrows immediately.',
    suggested_measures: ['Clear ridge furrows to keep root zone aerated.'],
    icar_reference_code: 'ICAR-DGR-GND-01',
    localized_templates: {
      hi: 'मूंगफली में अधिक नमी से कॉलर रॉट (तना सड़न) रोग का खतरा बढ़ता है। पानी निकासी सुनिश्चित करें।',
      mr: 'भुईमूग पिकात पाणी साचून राहिल्यास खोडकुजव्या रोगाचा धोका वाढतो, चर काढून पाणी बाहेर काढा.',
      te: 'వేరుశనగ పొలంలో నీరు నిల్వ ఉండకుండా జాగ్రత్తపడండి.',
      ta: 'நிலக்கடலை வயலில் தேங்கிய நீரை உடனே வெளியேற்றவும்.',
      bn: 'চিনাবাদাম জমিতে অতিরিক্ত জল জমে থাকা রোধে নিকাশি ব্যবস্থা করুন।',
      gu: 'મગફળીમાં પાણી ભરાઈ રહેવાથી થડના સડાનો ભય રહે છે, નિકાલ કરો.',
      kn: 'ಕಡಲೆಕಾಯಿ ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಬಸಿಗಾಲುವೆ ಮಾಡಿ.',
      pa: 'ਮੂੰਗਫਲੀ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਵਾਧੂ ਪਾਣੀ ਬਾਹਰ ਕੱਢੋ।',
      or: 'ଚିନାବାଦାମ ଜମିରୁ ତୁରନ୍ତ ପାଣି ନିଷ୍କାସନ କରନ୍ତୁ।',
    },
    is_active: true,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
];
