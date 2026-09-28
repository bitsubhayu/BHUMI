-- Migration: 20260928000001_seed_advisory_rules.sql
-- Description: Seed verified ICAR-CRIDA Kharif agronomic advisory rules and multilingual templates.

INSERT INTO public.advisory_rules (
    rule_code, action_type, crop_category, trigger_condition,
    english_title, english_recommendation, suggested_measures,
    icar_reference_code, localized_templates, is_active
) VALUES
(
    'ICAR-CRIDA-DELAY-01',
    'delay_sowing',
    'general',
    'break_probability >= 50 AND lead_time_bucket IN (week_1, week_2)',
    'Delay Kharif Sowing Advisory',
    'High probability of dry break spell detected during the early vegetative window. Withhold direct sowing or nursery transplanting until continuous rainfall revival is confirmed to prevent seedling desiccation and germination failure.',
    ARRAY[
        'Postpone sowing operations until a minimum 50-75 mm cumulative rainfall spell is received.',
        'Keep short-duration or drought-tolerant seed varieties ready for contingency planting.',
        'Ensure seed drill and farm implements are pre-calibrated for rapid sowing once monsoon revives.'
    ],
    'ICAR-CRIDA-KHARIF-STD-01',
    '{"hi": "शुरुआती वानस्पतिक चरण में शुष्क अंतराल (ड्राई ब्रेक) की उच्च संभावना है। बीजों को सूखने और अंकुरण विफलता से बचाने के लिए निरंतर मानसूनी वर्षा की पुष्टि होने तक बुवाई स्थगित रखें।", "mr": "सुरुवातीच्या वाढीच्या टप्प्यात पावसाचा मोठा खंड पडण्याची दाट शक्यता आहे. बियाणे वाया जाणे व उगवण अपयशी ठरणे टाळण्यासाठी पाऊस पुन्हा नियमित सुरू होईपर्यंत पेरणी तात्पुरती थांबवा.", "te": "మొలకెత్తే దశలో వర్షాభావం లేదా సుదీర్ఘ పొడి కాలం ఏర్పడే అవకాశం ఉంది. విత్తనాలు మొలకెత్తక ఎండిపోకుండా ఉండేందుకు వర్షాలు మళ్లీ ప్రారంభమయ్యే వరకు విత్తనాలు వేయడం వాయిదా వేయండి.", "ta": "ஆரம்ப கட்டத்தில் கடுமையான வறண்ட வானிலை நிலவ வாய்ப்புள்ளது. முளைப்புத் திறன் பாதிப்பு மற்றும் நாற்றுக்கள் காய்ந்து போவதைத் தவிர்க்க தொடர் மழை உறுதி செய்யப்படும் வரை விதைப்பை ஒத்திவைக்கவும்.", "bn": "প্রাথমিক বৃদ্ধির পর্যায়ে দীর্ঘ অনাবৃষ্টির প্রবল আশঙ্কা রয়েছে। বীজের অঙ্কুরোদগম ব্যর্থতা ও চারা নষ্ট হওয়া রোধে পুনরায় পর্যাপ্ত বৃষ্টিপাত নিশ্চিত না হওয়া পর্যন্ত বপন কাজ স্থগিত রাখুন।", "gu": "પાકની શરૂઆતની અવસ્થામાં લાંબા વરસાદી વિરામની શક્યતા છે. બિયારણ બળી જતું અટકાવવા અને યોગ્ય અંકુરણ માટે વરસાદ ફરી સક્રિય ન થાય ત્યાં સુધી વાવણી મુલતવી રાખો.", "kn": "ಬೆಳೆಯ ಆರಂಭಿಕ ಹಂತದಲ್ಲಿ ಮಳೆಯ ಕೊರತೆ ಉಂಟಾಗುವ ಸಾಧ್ಯತೆಯಿದೆ. ಬೀಜ ಒಣಗಿ ಹಾಳಾಗುವುದನ್ನು ತಪ್ಪಿಸಲು ನಿರಂತರ ಮಳೆ ಆರಂಭವಾಗುವವರೆಗೆ ಬಿತ್ತನೆಯನ್ನು ಮುಂದೂಡಿ.", "pa": "ਮੁੱਢਲੇ ਵਾਧੇ ਦੌਰਾਨ ਲੰਬੇ ਖੁਸ਼ਕ ਦੌਰ ਦਾ ਖਦਸ਼ਾ ਹੈ। ਬੀਜ ਦੇ ਖਰਾਬ ਹੋਣ ਤੋਂ ਬਚਾਅ ਲਈ ਮਾਨਸੂਨੀ ਮੀਂਹ ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਹੋਣ ਤੱਕ ਬਿਜਾਈ ਰੋਕ ਕੇ ਰੱਖੋ।", "or": "ପ୍ରାରମ୍ଭିକ ବୃଦ୍ଧି ସମୟରେ ବର୍ଷା ଅଭାବ ହେବାର ଆଶଙ୍କା ରହିଛି। ଗଜା ନଷ୍ଟ ହେବାରୁ ରକ୍ଷା କରିବା ପାଇଁ ନିୟମିତ ବର୍ଷା ଆରମ୍ଭ ନହେବା ପର୍ଯ୍ୟନ୍ତ ବିହନ ବୁଣିବା ବନ୍ଦ ରଖନ୍ତୁ।"}'::jsonb,
    true
),
(
    'ICAR-CRIDA-IRRIG-01',
    'prepare_irrigation',
    'general',
    'break_probability >= 40',
    'Supplemental Irrigation Preparedness',
    'Elevated probability of deficient rainfall and extended dry break spell. Mobilize farm pond storage, borewell connections, and micro-irrigation systems to protect standing Kharif crops against critical soil moisture deficit.',
    ARRAY[
        'Service pump sets, check valve seals, and clear drip/sprinkler laterals.',
        'Prioritize life-saving protective irrigation for crops in flowering or pod-filling stages.',
        'Apply organic residue or straw mulching in crop inter-rows to retard soil moisture loss.'
    ],
    'ICAR-CRIDA-KHARIF-STD-02',
    '{"hi": "कम वर्षा और लंबे शुष्क अंतराल की संभावना है। खड़ी फसलों को नमी के संकट से बचाने के लिए खेत तालाब (फार्म पॉन्ड) और सूक्ष्म सिंचाई उपकरणों को तैयार रखें।", "mr": "पावसात मोठा खंड पडण्याची शक्यता असल्याने जमिनीतील ओलावा वेगाने कमी होऊ शकतो. उभ्या पिकांना ओलाव्याचा ताण बसू नये म्हणून शेततळे, विहीर व सूक्ष्म सिंचन यंत्रणा सज्ज ठेवा.", "te": "వర్షపాత లోటు మరియు పొడి వాతావరణం ఏర్పడే ప్రమాదం ఉన్నందున పంటలకు నీటి ఎద్దడి రాకుండా ఫారమ్ పాండ్ మరియు సూక్ష్మ నీటిపారుదల వనరులను సిద్ధం చేసుకోండి.", "ta": "நீண்ட வறண்ட இடைவெளி நிலவக்கூடும் என்பதால் நிலத்தடி நீர் மற்றும் பண்ணைக் குட்டை நீரைப் பயன்படுத்தி பயிர்களைக் காப்பாற்ற நுண்ணீர்ப் பாசனத்தை தயார் செய்யவும்.", "bn": "বৃষ্টিহীন শুষ্ক আবহাওয়ার কারণে জমিতে আর্দ্রতার তীব্র সংকট হতে পারে। ফসলের সুরক্ষায় খামার পুকুর ও ড্রিপ/স্প্রিংকলার সেচ ব্যবস্থা অবিলম্বে কার্যকর করুন।", "gu": "વરસાદની અછતને લીધે ઊભા પાકને ભેજની ખેંચ પડી શકે છે. પાકને બચાવવા માટે ખેત તલાવડી, બોરવેલ અને ટપક પિયત સાધનો સત્વરે તૈયાર રાખો.", "kn": "ಮಳೆ ಕೊರತೆಯಿಂದಾಗಿ ತೇವಾಂಶದ ಕೊರತೆ ಎದುರಾಗಬಹುದು. ಬೆಳೆಗಳನ್ನು ರಕ್ಷಿಸಲು ಕೃಷಿ ಹೊಂಡ, ಕೊಳವೆಬಾವಿ ಮತ್ತು ಹನಿ ನೀರಾವರಿ ಸಾಧನಗಳನ್ನು ಸಿದ್ಧವಾಗಿಟ್ಟುಕೊಳ್ಳಿ.", "pa": "ਸੋਕੇ ਦੇ ਹਾਲਾਤਾਂ ਕਾਰਨ ਖੜ੍ਹੀਆਂ ਫਸਲਾਂ ਨੂੰ ਪਾਣੀ ਦੀ ਘਾਟ ਪੈ ਸਕਦੀ ਹੈ। ਖੇਤ ਤਲਾਬ ਅਤੇ ਤੁਪਕਾ ਸਿੰਚਾਈ ਪ੍ਰਣਾਲੀ ਨੂੰ ਤੁਰੰਤ ਕਾਰਜਸ਼ੀਲ ਕਰੋ।", "or": "ଦୀର୍ଘ ଶୁଷ୍କ ପାଗ ଯୋଗୁଁ ଫସଲରେ ଜଳାଭାବ ଦେଖାଦେଇପାରେ। ଫସଲକୁ ସୁରକ୍ଷା ଦେବା ପାଇଁ ପୋଖରୀ ଓ ବୁନ୍ଦା ଜଳସେଚନ ବ୍ୟବସ୍ଥା ସଜାଗ ରଖନ୍ତୁ।"}'::jsonb,
    true
),
(
    'ICAR-CRIDA-DRAIN-01',
    'drainage_alert',
    'general',
    'heavy_spell_probability >= 40',
    'Field Drainage & Waterlogging Alert',
    'High probability of heavy precipitation spells. Open field bunds and clear natural drainage channels to drain standing excess water, preventing root asphyxiation and damping-off diseases.',
    ARRAY[
        'Create drainage trenches and unclog bund spillways across all lowland plots.',
        'Postpone top-dressing of nitrogen fertilizers and foliar pesticide sprays prior to heavy downpour.',
        'Check seedlings and crops for waterborne fungal infections once floodwaters recede.'
    ],
    'ICAR-CRIDA-KHARIF-STD-03',
    '{"hi": "भारी वर्षा के दौर की उच्च संभावना है। खेत की मेड़ों के निकास खोलें और नालियों को साफ करें ताकि अतिरिक्त पानी निकल सके और फसलों की जड़ें गलने से बचें।", "mr": "मुसळधार पावसाची शक्यता असल्याने शेतात पाणी साचून पिकांची मुळे कुजण्याचा धोका आहे. शेतातील पाण्याचा निचरा होण्यासाठी तातडीने चर खोदा व बांधांचे निकास मोकळे करा.", "te": "భారీ వర్షాలు కురిసే అవకాశం ఉన్నందున పొలంలో నీరు నిల్వ ఉండకుండా కాలువలను శుభ్రం చేసి అదనపు నీటిని వెంటనే బయటకు పంపండి.", "ta": "கனமழை பெய்ய வாய்ப்புள்ளதால் பயிர்கள் மூழ்குவதைத் தடுக்கவும் வேரழுகல் நோயைத் தவிர்க்கவும் வயலில் இருந்து உபரி நீரை உடனடியாக வடிக்கவும்.", "bn": "ভারী বর্ষণের প্রবল সম্ভাবনা রয়েছে। জমিতে জল জমে ফসলের শিকড় পচে যাওয়া রোধ করতে আইলের মুখ খুলে অতিরিক্ত জল বের করে দিন।", "gu": "ભારે વરસાદની આગાહી હોવાથી ખેતરમાં પાણી ભરાઈ રહેવાથી મૂળ સડવાનો ભય રહે છે. ખેતરમાંથી વધારાના પાણીના નિકાલ માટે પાળાના મુખ ખોલો.", "kn": "ಭಾರೀ ಮಳೆಯಾಗುವ ಸಾಧ್ಯತೆಯಿರುವುದರಿಂದ ಜಮೀನಿನಲ್ಲಿ ನೀರು ನಿಂತು ಬೇರು ಕೊಳೆಯದಂತೆ ಬದುಗಳ ಕಾಲುವೆಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ ಹೆಚ್ಚುವರಿ ನೀರನ್ನು ಹೊರಹಾಕಿ.", "pa": "ਭਾਰੀ ਮੀਂਹ ਦੇ ਖਦਸ਼ੇ ਕਾਰਨ ਖੇਤਾਂ ਵਿੱਚ ਪਾਣੀ ਖੜ੍ਹਨ ਨਾਲ ਜੜ੍ਹਾਂ ਗਲਣ ਦਾ ਡਰ ਹੈ। ਵਾਧੂ ਪਾਣੀ ਦੇ ਨਿਕਾਸ ਲਈ ਖਾਲਾਂ ਅਤੇ ਬੰਨ੍ਹਾਂ ਨੂੰ ਤੁਰੰਤ ਸਾਫ਼ ਕਰੋ।", "or": "ପ୍ରବଳ ବର୍ଷା ହେବାର ସମ୍ଭାବନା ଥିବାରୁ ଜମିରେ ପାଣି ଜମି ଚେର ସଢ଼ିବା ଆଶଙ୍କା ରହିଛି। ଜମିରୁ ଅତିରିକ୍ତ ଜଳ ନିଷ୍କାସନ ପାଇଁ ହିଡ଼ର କାଟି ନାଳି ସଫା କରନ୍ତୁ।"}'::jsonb,
    true
),
(
    'ICAR-CRIDA-SOW-01',
    'safe_to_sow',
    'general',
    'onset_probability >= 50 AND break_probability <= 30',
    'Favorable Monsoon Sowing Window',
    'Active monsoon onset conditions with sustained rainfall probability support optimal root-zone seedbed moisture. Proceed with certified Kharif seed sowing in properly prepared land.',
    ARRAY[
        'Treat seeds with recommended bio-fertilizers (Rhizobium/PSB/Trichoderma) prior to sowing.',
        'Maintain depth and spacing per state agriculture university package of practices.',
        'Apply recommended basal fertilizer dose based on soil health card parameters.'
    ],
    'ICAR-CRIDA-KHARIF-STD-04',
    '{"hi": "सक्रिय मानसून और पर्याप्त वर्षा की संभावना से मिट्टी में अनुकूल नमी उपलब्ध है। अच्छी तरह तैयार खेतों में प्रमाणित बीजों से खरीफ बुवाई शुरू करें।", "mr": "मान्सूनचे आगमन समाधानकारक असून जमिनीत पेरणीयोग्य वाफसा तयार झाला आहे. चांगल्या मशागत केलेल्या शेतात प्रमाणित बियाण्यांची पेरणी सुरू करा.", "te": "సకాలంలో వర్షాలు కురవడంతో నేలలో సరిపడా తేమ ఉంది. సిద్ధం చేసిన పొలాలలో నాణ్యమైన విత్తనాలతో ఖరీఫ్ విత్తనాలు వేయడం ప్రారంభించండి.", "ta": "பருவமழை சாதகமாக உள்ளதால் மண்ணில் நல்ல ஈரப்பதம் உள்ளது. உரிய முறையில் நிலத்தைத் தயார் செய்து சான்றுபெற்ற விதைகளைக் கொண்டு விதைப்பைத் தொடங்கலாம்.", "bn": "বর্ষার অনুকূল প্রভাবে জমিতে উপযুক্ত আর্দ্রতা তৈরি হয়েছে। সঠিকভাবে প্রস্তুত জমিতে শোধিত বীজ বপন শুরু করুন।", "gu": "ચોમાસાની સમયસર શરૂઆતથી જમીનમાં પૂરતો ભેજ સંગ્રહાયો છે. તૈયાર કરેલા ખેતરમાં પ્રમાણિત બીજ સાથે ખરીફ પાકની વાવણી શરૂ કરો.", "kn": "ಮುಂಗಾರು ಮಳೆ ಸಮರ್ಪಕವಾಗಿದ್ದು ಮಣ್ಣಿನಲ್ಲಿ ಹದವಾದ ತೇವಾಂಶವಿದೆ. ಸಿದ್ಧಪಡಿಸಿದ ಜಮೀನಿನಲ್ಲಿ ಪ್ರಮಾಣೀಕೃತ ಬೀಜಗಳನ್ನು ಬಿತ್ತನೆ ಮಾಡಿ.", "pa": "ਮਾਨਸੂਨ ਦੀ ਆਮਦ ਨਾਲ ਜ਼ਮੀਨ ਵਿੱਚ ਪੂਰਾ ਵੱਤਰ ਹੈ। ਤਿਆਰ ਕੀਤੇ ਖੇਤਾਂ ਵਿੱਚ ਤਸਦੀਕਸ਼ੁਦਾ ਬੀਜਾਂ ਦੀ ਬਿਜਾਈ ਸ਼ੁਰੂ ਕਰੋ।", "or": "ମୌସୁମୀ ପ୍ରଭାବରେ ମାଟିରେ ଆବଶ୍ୟକୀୟ ଆର୍ଦ୍ରତା ରହିଛି। ଜମି ପ୍ରସ୍ତୁତ କରି ବିଶୋଧିତ ବିହନ ବୁଣିବା ଆରମ୍ଭ କରନ୍ତୁ।"}'::jsonb,
    true
),
(
    'ICAR-CRIDA-MONITOR-01',
    'monitor_conditions',
    'general',
    'default',
    'Normal Seasonal Monitoring',
    'Monsoon probability indices are within seasonal climatological bounds. Proceed with scheduled field operations, intercultural weeding, and monitor upcoming weekly lead advisories.',
    ARRAY[
        'Maintain routine field scouting for early pest infestation and fungal symptoms.',
        'Undertake manual weeding or mechanical hoeing to improve soil aeration.',
        'Check weekly multi-model lead forecasts for emerging break transitions.'
    ],
    'ICAR-CRIDA-KHARIF-STD-05',
    '{"hi": "मौसम संबंधी जोखिम सूचकांक सामान्य सीमा में हैं। नियमित निराई-गुड़ाई एवं कृषि कार्य जारी रखें तथा आगामी साप्ताहिक मौसम पूर्वानुमान पर नजर रखें।", "mr": "हवामानाचे अंदाज सर्वसाधारण मर्यादेत आहेत. शेतातील नेहमीची आंतरमशागत, खुरपणी चालू ठेवा आणि पुढील आठवड्याच्या सुधारित हवामान अंदाजावर लक्ष ठेवा.", "te": "వాతావరణ పరిస్థితులు సాధారణంగా ఉన్నాయి. సాధారణ సాగు పనులు కొనసాగించండి మరియు రాబోయే వారాల వాతావరణ సమాచారాన్ని గమనిస్తూ ఉండండి.", "ta": "வானிலை இயல்பு நிலையில் உள்ளது. வழக்கமான களை எடுப்பு மற்றும் களப்பணிகளைத் தொடரவும், அடுத்த வார முன்னறிவிப்பைக் கவனிக்கவும்.", "bn": "আবহাওয়া পরিস্থিতি স্বাভাবিক মাত্রায় রয়েছে। সাধারণ চাষের কাজ, নিড়ানি ও আগাছা দমন চালিয়ে যান এবং পরবর্তী আবহাওয়ার পূর্বাভাস পর্যবেক্ষণ করুন।", "gu": "હવામાન સૂચકાંકો સામાન્ય સીમામાં છે. નિયમિત નીંદામણ અને આંતરખેડ ચાલુ રાખો તેમજ આગામી સાપ્તાહિક આગાહી પર નજર રાખો.", "kn": "ಹವಾಮಾನ ಪರಿಸ್ಥಿತಿಗಳು ಸಾಮಾನ್ಯ ಮಿತಿಯಲ್ಲಿದೆ. ಸಾಂಪ್ರದಾಯಿಕ ಕೃಷಿ ಚಟುವಟಿಕೆಗಳು ಮತ್ತು ಕಳೆ ಕೀಳುವ ಕೆಲಸವನ್ನು ಮುಂದುವರಿಸಿ ಮುಂದಿನ ವಾರದ ಮುನ್ಸೂಚನೆಯನ್ನು ಗಮನಿಸಿ.", "pa": "ਮੌਸਮ ਦੇ ਹਾਲਾਤ ਆਮ ਹਨ। ਨਦੀਨਾਂ ਦੀ ਰੋਕਥਾਮ ਅਤੇ ਆਮ ਖੇਤੀ ਕੰਮ ਜਾਰੀ ਰੱਖੋ ਅਤੇ ਅਗਲੇ ਹਫ਼ਤੇ ਦੀ ਮੌਸਮ ਜਾਣਕਾਰੀ ਤੇ ਨਜ਼ਰ ਰੱਖੋ।", "or": "ପାଣିପାଗ ସ୍ଥିତି ସ୍ୱାଭାବିକ ରହିଛି। ନିୟମିତ ଘାସ ବଛା ଓ କୃଷି କାର୍ଯ୍ୟ ଜାରି ରଖନ୍ତୁ ଏବଂ ପରବର୍ତ୍ତୀ ସପ୍ତାହର ପୂର୍ବାନୁମାନ ଦେଖନ୍ତୁ।"}'::jsonb,
    true
)
ON CONFLICT (rule_code) DO UPDATE SET
    action_type = EXCLUDED.action_type,
    crop_category = EXCLUDED.crop_category,
    trigger_condition = EXCLUDED.trigger_condition,
    english_title = EXCLUDED.english_title,
    english_recommendation = EXCLUDED.english_recommendation,
    suggested_measures = EXCLUDED.suggested_measures,
    icar_reference_code = EXCLUDED.icar_reference_code,
    localized_templates = EXCLUDED.localized_templates,
    is_active = EXCLUDED.is_active,
    updated_at = timezone('utc'::text, now());
