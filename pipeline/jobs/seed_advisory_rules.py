"""Idempotent seed script to populate public.advisory_rules in Supabase.

Uploads authoritative ICAR / KVK threshold rules with multilingual templates across
10 regional Indian languages.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List
import requests

from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger

logger = get_logger("bhumi.jobs.seed_advisory_rules")

SEEDED_ADVISORY_RULES: List[Dict[str, Any]] = [
    {
        "rule_code": "ICAR-CRIDA-DELAY-01",
        "action_type": "delay_sowing",
        "crop_category": "general",
        "trigger_condition": "break_probability >= 50 AND lead_time_bucket IN (week_1, week_2)",
        "english_title": "Delay Kharif Sowing Advisory",
        "english_recommendation": "High probability of dry break spell detected during the early vegetative window. Withhold direct sowing or nursery transplanting until continuous rainfall revival is confirmed to prevent seedling desiccation and germination failure.",
        "suggested_measures": [
            "Postpone sowing operations until a minimum 50-75 mm cumulative rainfall spell is received.",
            "Keep short-duration or drought-tolerant seed varieties ready for contingency planting.",
            "Ensure seed drill and farm implements are pre-calibrated for rapid sowing once monsoon revives."
        ],
        "icar_reference_code": "ICAR-CRIDA-KHARIF-STD-01",
        "localized_templates": {
            "hi": "शुरुआती वानस्पतिक चरण में शुष्क अंतराल (ड्राई ब्रेक) की उच्च संभावना है। बीजों को सूखने और अंकुरण विफलता से बचाने के लिए निरंतर मानसूनी वर्षा की पुष्टि होने तक बुवाई स्थगित रखें।",
            "mr": "सुरुवातीच्या वाढीच्या टप्प्यात पावसाचा मोठा खंड पडण्याची दाट शक्यता आहे. बियाणे वाया जाणे व उगवण अपयशी ठरणे टाळण्यासाठी पाऊस पुन्हा नियमित सुरू होईपर्यंत पेरणी तात्पुरती थांबवा.",
            "te": "మొలకెత్తే దశలో వర్షాభావం లేదా సుదీర్ఘ పొడి కాలం ఏర్పడే అవకాశం ఉంది. విత్తనాలు మొలకెత్తక ఎండిపోకుండా ఉండేందుకు వర్షాలు మళ్లీ ప్రారంభమయ్యే వరకు విత్తనాలు వేయడం వాయిదా వేయండి.",
            "ta": "ஆரம்ப கட்டத்தில் கடுமையான வறண்ட வானிலை நிலவ வாய்ப்புள்ளது. முளைப்புத் திறன் பாதிப்பு மற்றும் நாற்றுக்கள் காய்ந்து போவதைத் தவிர்க்க தொடர் மழை உறுதி செய்யப்படும் வரை விதைப்பை ஒத்திவைக்கவும்.",
            "bn": "প্রাথমিক বৃদ্ধির পর্যায়ে দীর্ঘ অনাবৃষ্টির প্রবল আশঙ্কা রয়েছে। বীজের অঙ্কুরোদগম ব্যর্থতা ও চারা নষ্ট হওয়া রোধে পুনরায় পর্যাপ্ত বৃষ্টিপাত নিশ্চিত না হওয়া পর্যন্ত বপন কাজ স্থগিত রাখুন।",
            "gu": "પાકની શરૂઆતની અવસ્થામાં લાંબા વરસાદી વિરામની શક્યતા છે. બિયારણ બળી જતું અટકાવવા અને યોગ્ય અંકુરણ માટે વરસાદ ફરી સક્રિય ન થાય ત્યાં સુધી વાવણી મુલતવી રાખો.",
            "kn": "ಬೆಳೆಯ ಆರಂಭಿಕ ಹಂತದಲ್ಲಿ ಮಳೆಯ ಕೊರತೆ ಉಂಟಾಗುವ ಸಾಧ್ಯತೆಯಿದೆ. ಬೀಜ ಒಣಗಿ ಹಾಳಾಗುವುದನ್ನು ತಪ್ಪಿಸಲು ನಿರಂತರ ಮಳೆ ಆರಂಭವಾಗುವವರೆಗೆ ಬಿತ್ತನೆಯನ್ನು ಮುಂದೂಡಿ.",
            "pa": "ਮੁੱਢਲੇ ਵਾਧੇ ਦੌਰਾਨ ਲੰਬੇ ਖੁਸ਼ਕ ਦੌਰ ਦਾ ਖਦਸ਼ਾ ਹੈ। ਬੀਜ ਦੇ ਖਰਾਬ ਹੋਣ ਤੋਂ ਬਚਾਅ ਲਈ ਮਾਨਸੂਨੀ ਮੀਂਹ ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਹੋਣ ਤੱਕ ਬਿਜਾਈ ਰੋਕ ਕੇ ਰੱਖੋ।",
            "or": "ପ୍ରାରମ୍ଭିକ ବୃଦ୍ଧି ସମୟରେ ବର୍ଷା ଅଭାବ ହେବାର ଆଶଙ୍କା ରହିଛି। ଗଜା ନଷ୍ଟ ହେବାରୁ ରକ୍ଷା କରିବା ପାଇଁ ନିୟମିତ ବର୍ଷା ଆରମ୍ଭ ନହେବା ପର୍ଯ୍ୟନ୍ତ ବିହନ ବୁଣିବା ବନ୍ଦ ରଖନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-CRIDA-IRRIG-01",
        "action_type": "prepare_irrigation",
        "crop_category": "general",
        "trigger_condition": "break_probability >= 40",
        "english_title": "Supplemental Irrigation Preparedness",
        "english_recommendation": "Elevated probability of deficient rainfall and extended dry break spell. Mobilize farm pond storage, borewell connections, and micro-irrigation systems to protect standing Kharif crops against critical soil moisture deficit.",
        "suggested_measures": [
            "Service pump sets, check valve seals, and clear drip/sprinkler laterals.",
            "Prioritize life-saving protective irrigation for crops in flowering or pod-filling stages.",
            "Apply organic residue or straw mulching in crop inter-rows to retard soil moisture loss."
        ],
        "icar_reference_code": "ICAR-CRIDA-KHARIF-STD-02",
        "localized_templates": {
            "hi": "कम वर्षा और लंबे शुष्क अंतराल की संभावना है। खड़ी फसलों को नमी के संकट से बचाने के लिए खेत तालाब (फार्म पॉन्ड) और सूक्ष्म सिंचाई उपकरणों को तैयार रखें।",
            "mr": "पावसात मोठा खंड पडण्याची शक्यता असल्याने जमिनीतील ओलावा वेगाने कमी होऊ शकतो. उभ्या पिकांना ओलाव्याचा ताण बसू नये म्हणून शेततळे, विहीर व सूक्ष्म सिंचन यंत्रणा सज्ज ठेवा.",
            "te": "వర్షపాత లోటు మరియు పొడి వాతావరణం ఏర్పడే ప్రమాదం ఉన్నందున పంటలకు నీటి ఎద్దడి రాకుండా ఫారమ్ పాండ్ మరియు సూక్ష్మ నీటిపారుదల వనరులను సిద్ధం చేసుకోండి.",
            "ta": "நீண்ட வறண்ட இடைவெளி நிலவக்கூடும் என்பதால் நிலத்தடி நீர் மற்றும் பண்ணைக் குட்டை நீரைப் பயன்படுத்தி பயிர்களைக் காப்பாற்ற நுண்ணீர்ப் பாசனத்தை தயார் செய்யவும்.",
            "bn": "বৃষ্টিহীন শুষ্ক আবহাওয়ার কারণে জমিতে আর্দ্রতার তীব্র সংকট হতে পারে। ফসলের সুরক্ষায় খামার পুকুর ও ড্রিপ/স্প্রিংকলার সেচ ব্যবস্থা অবিলম্বে কার্যকর করুন।",
            "gu": "વરસાદની અછતને લીધે ઊભા પાકને ભેજની ખેંચ પડી શકે છે. પાકને બચાવવા માટે ખેત તલાવડી, બોરવેલ અને ટપક પિયત સાધનો સત્વરે તૈયાર રાખો.",
            "kn": "ಮಳೆ ಕೊರತೆಯಿಂದಾಗಿ ತೇವಾಂಶದ ಕೊರತೆ ಎದುರಾಗಬಹುದು. ಬೆಳೆಗಳನ್ನು ರಕ್ಷಿಸಲು ಕೃಷಿ ಹೊಂಡ, ಕೊಳವೆಬಾವಿ ಮತ್ತು ಹನಿ ನೀರಾವರಿ ಸಾಧನಗಳನ್ನು ಸಿದ್ಧವಾಗಿಟ್ಟುಕೊಳ್ಳಿ.",
            "pa": "ਸੋਕੇ ਦੇ ਹਾਲਾਤਾਂ ਕਾਰਨ ਖੜ੍ਹੀਆਂ ਫਸਲਾਂ ਨੂੰ ਪਾਣੀ ਦੀ ਘਾਟ ਪੈ ਸਕਦੀ ਹੈ। ਖੇਤ ਤਲਾਬ ਅਤੇ ਤੁਪਕਾ ਸਿੰਚਾਈ ਪ੍ਰਣਾਲੀ ਨੂੰ ਤੁਰੰਤ ਕਾਰਜਸ਼ੀਲ ਕਰੋ।",
            "or": "ଦୀର୍ଘ ଶୁଷ୍କ ପାଗ ଯୋଗୁଁ ଫସଲରେ ଜଳାଭାବ ଦେଖାଦେଇପାରେ। ଫସଲକୁ ସୁରକ୍ଷା ଦେବା ପାଇଁ ପୋଖରୀ ଓ ବୁନ୍ଦା ଜଳସେଚନ ବ୍ୟବସ୍ଥା ସଜାଗ ରଖନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-CRIDA-DRAIN-01",
        "action_type": "drainage_alert",
        "crop_category": "general",
        "trigger_condition": "heavy_spell_probability >= 40",
        "english_title": "Field Drainage & Waterlogging Alert",
        "english_recommendation": "High probability of heavy precipitation spells. Open field bunds and clear natural drainage channels to drain standing excess water, preventing root asphyxiation and damping-off diseases.",
        "suggested_measures": [
            "Create drainage trenches and unclog bund spillways across all lowland plots.",
            "Postpone top-dressing of nitrogen fertilizers and foliar pesticide sprays prior to heavy downpour.",
            "Check seedlings and crops for waterborne fungal infections once floodwaters recede."
        ],
        "icar_reference_code": "ICAR-CRIDA-KHARIF-STD-03",
        "localized_templates": {
            "hi": "भारी वर्षा के दौर की उच्च संभावना है। खेत की मेड़ों के निकास खोलें और नालियों को साफ करें ताकि अतिरिक्त पानी निकल सके और फसलों की जड़ें गलने से बचें।",
            "mr": "मुसळधार पावसाची शक्यता असल्याने शेतात पाणी साचून पिकांची मुळे कुजण्याचा धोका आहे. शेतातील पाण्याचा निचरा होण्यासाठी तातडीने चर खोदा व बांधांचे निकास मोकळे करा.",
            "te": "భారీ వర్షాలు కురిసే అవకాశం ఉన్నందున పొలంలో నీరు నిల్వ ఉండకుండా కాలువలను శుభ్రం చేసి అదనపు నీటిని వెంటనే బయటకు పంపండి.",
            "ta": "கனமழை பெய்ய வாய்ப்புள்ளதால் பயிர்கள் மூழ்குவதைத் தடுக்கவும் வேரழுகல் நோயைத் தவிர்க்கவும் வயலில் இருந்து உபரி நீரை உடனடியாக வடிக்கவும்.",
            "bn": "ভারী বর্ষণের প্রবল সম্ভাবনা রয়েছে। জমিতে জল জমে ফসলের শিকড় পচে যাওয়া রোধ করতে আইলের মুখ খুলে অতিরিক্ত জল বের করে দিন।",
            "gu": "ભારે વરસાદની આગાહી હોવાથી ખેતરમાં પાણી ભરાઈ રહેવાથી મૂળ સડવાનો ભય રહે છે. ખેતરમાંથી વધારાના પાણીના નિકાલ માટે પાળાના મુખ ખોલો.",
            "kn": "ಭಾರೀ ಮಳೆಯಾಗುವ ಸಾಧ್ಯತೆಯಿರುವುದರಿಂದ ಜಮೀನಿನಲ್ಲಿ ನೀರು ನಿಂತು ಬೇರು ಕೊಳೆಯದಂತೆ ಬದುಗಳ ಕಾಲುವೆಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ ಹೆಚ್ಚುವರಿ ನೀರನ್ನು ಹೊರಹಾಕಿ.",
            "pa": "ਭਾਰੀ ਮੀਂਹ ਦੇ ਖਦਸ਼ੇ ਕਾਰਨ ਖੇਤਾਂ ਵਿੱਚ ਪਾਣੀ ਖੜ੍ਹਨ ਨਾਲ ਜੜ੍ਹਾਂ ਗਲਣ ਦਾ ਡਰ ਹੈ। ਵਾਧੂ ਪਾਣੀ ਦੇ ਨਿਕਾਸ ਲਈ ਖਾਲਾਂ ਅਤੇ ਬੰਨ੍ਹਾਂ ਨੂੰ ਤੁਰੰਤ ਸਾਫ਼ ਕਰੋ।",
            "or": "ପ୍ରବଳ ବର୍ଷା ହେବାର ସମ୍ଭାବନା ଥିବାରୁ ଜମିରେ ପାଣି ଜମି ଚେର ସଢ଼ିବା ଆଶଙ୍କା ରହିଛି। ଜମିରୁ ଅତିରିକ୍ତ ଜଳ ନିଷ୍କାସନ ପାଇଁ ହିଡ଼ର କାଟି ନାଳି ସଫା କରନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-CRIDA-SOW-01",
        "action_type": "safe_to_sow",
        "crop_category": "general",
        "trigger_condition": "onset_probability >= 50 AND break_probability <= 30",
        "english_title": "Favorable Monsoon Sowing Window",
        "english_recommendation": "Active monsoon onset conditions with sustained rainfall probability support optimal root-zone seedbed moisture. Proceed with certified Kharif seed sowing in properly prepared land.",
        "suggested_measures": [
            "Treat seeds with recommended bio-fertilizers (Rhizobium/PSB/Trichoderma) prior to sowing.",
            "Maintain depth and spacing per state agriculture university package of practices.",
            "Apply recommended basal fertilizer dose based on soil health card parameters."
        ],
        "icar_reference_code": "ICAR-CRIDA-KHARIF-STD-04",
        "localized_templates": {
            "hi": "सक्रिय मानसून और पर्याप्त वर्षा की संभावना से मिट्टी में अनुकूल नमी उपलब्ध है। अच्छी तरह तैयार खेतों में प्रमाणित बीजों से खरीफ बुवाई शुरू करें।",
            "mr": "मान्सूनचे आगमन समाधानकारक असून जमिनीत पेरणीयोग्य वाफसा तयार झाला आहे. चांगल्या मशागत केलेल्या शेतात प्रमाणित बियाण्यांची पेरणी सुरू करा.",
            "te": "సకాలంలో వర్షాలు కురవడంతో నేలలో సరిపడా తేమ ఉంది. సిద్ధం చేసిన పొలాలలో నాణ్యమైన విత్తనాలతో ఖరీఫ్ విత్తనాలు వేయడం ప్రారంభించండి.",
            "ta": "பருவமழை சாதகமாக உள்ளதால் மண்ணில் நல்ல ஈரப்பதம் உள்ளது. உரிய முறையில் நிலத்தைத் தயார் செய்து சான்றுபெற்ற விதைகளைக் கொண்டு விதைப்பைத் தொடங்கலாம்.",
            "bn": "বর্ষার অনুকূল প্রভাবে জমিতে উপযুক্ত আর্দ্রতা তৈরি হয়েছে। সঠিকভাবে প্রস্তুত জমিতে শোধিত বীজ বপন শুরু করুন।",
            "gu": "ચોમાસાની સમયસર શરૂઆતથી જમીનમાં પૂરતો ભેજ સંગ્રહાયો છે. તૈયાર કરેલા ખેતરમાં પ્રમાણિત બીજ સાથે ખરીફ પાકની વાવણી શરૂ કરો.",
            "kn": "ಮುಂಗಾರು ಮಳೆ ಸಮರ್ಪಕವಾಗಿದ್ದು ಮಣ್ಣಿನಲ್ಲಿ ಹದವಾದ ತೇವಾಂಶವಿದೆ. ಸಿದ್ಧಪಡಿಸಿದ ಜಮೀನಿನಲ್ಲಿ ಪ್ರಮಾಣೀಕೃತ ಬೀಜಗಳನ್ನು ಬಿತ್ತನೆ ಮಾಡಿ.",
            "pa": "ਮਾਨਸੂਨ ਦੀ ਆਮਦ ਨਾਲ ਜ਼ਮੀਨ ਵਿੱਚ ਪੂਰਾ ਵੱਤਰ ਹੈ। ਤਿਆਰ ਕੀਤੇ ਖੇਤਾਂ ਵਿੱਚ ਤਸਦੀਕਸ਼ੁਦਾ ਬੀਜਾਂ ਦੀ ਬਿਜਾਈ ਸ਼ੁਰੂ ਕਰੋ।",
            "or": "ମୌସୁମୀ ପ୍ରଭାବରେ ମାଟିରେ ଆବଶ୍ୟକୀୟ ଆର୍ଦ୍ରତା ରହିଛି। ଜମି ପ୍ରସ୍ତୁତ କରି ବିଶୋଧିତ ବିହନ ବୁଣିବା ଆରମ୍ଭ କରନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-CRIDA-MONITOR-01",
        "action_type": "monitor_conditions",
        "crop_category": "general",
        "trigger_condition": "default",
        "english_title": "Normal Seasonal Monitoring",
        "english_recommendation": "Monsoon probability indices are within seasonal climatological bounds. Proceed with scheduled field operations, intercultural weeding, and monitor upcoming weekly lead advisories.",
        "suggested_measures": [
            "Maintain routine field scouting for early pest infestation and fungal symptoms.",
            "Undertake manual weeding or mechanical hoeing to improve soil aeration.",
            "Check weekly multi-model lead forecasts for emerging break transitions."
        ],
        "icar_reference_code": "ICAR-CRIDA-KHARIF-STD-05",
        "localized_templates": {
            "hi": "मौसम संबंधी जोखिम सूचकांक सामान्य सीमा में हैं। नियमित निराई-गुड़ाई एवं कृषि कार्य जारी रखें तथा आगामी साप्ताहिक मौसम पूर्वानुमान पर नजर रखें।",
            "mr": "हवामानाचे अंदाज सर्वसाधारण मर्यादेत आहेत. शेतातील नेहमीची आंतरमशागत, खुरपणी चालू ठेवा आणि पुढील आठवड्याच्या सुधारित हवामान अंदाजावर लक्ष ठेवा.",
            "te": "వాతావరణ పరిస్థితులు సాధారణంగా ఉన్నాయి. సాధారణ సాగు పనులు కొనసాగించండి మరియు రాబోయే వారాల వాతావరణ సమాచారాన్ని గమనిస్తూ ఉండండి.",
            "ta": "வானிலை இயல்பு நிலையில் உள்ளது. வழக்கமான களை எடுப்பு மற்றும் களப்பணிகளைத் தொடரவும், அடுத்த வார முன்னறிவிப்பைக் கவனிக்கவும்.",
            "bn": "আবহাওয়া পরিস্থিতি স্বাভাবিক মাত্রায় রয়েছে। সাধারণ চাষের কাজ, নিড়ানি ও আগাছা দমন চালিয়ে যান এবং পরবর্তী আবহাওয়ার পূর্বাভাস পর্যবেক্ষণ করুন।",
            "gu": "હવામાન સૂચકાંકો સામાન્ય સીમામાં છે. નિયમિત નીંદામણ અને આંતરખેડ ચાલુ રાખો તેમજ આગામી સાપ્તાહિક આગાહી પર નજર રાખો.",
            "kn": "ಹವಾಮಾನ ಪರಿಸ್ಥಿತಿಗಳು ಸಾಮಾನ್ಯ ಮಿತಿಯಲ್ಲಿದೆ. ಸಾಂಪ್ರದಾಯಿಕ ಕೃಷಿ ಚಟುವಟಿಕೆಗಳು ಮತ್ತು ಕಳೆ ಕೀಳುವ ಕೆಲಸವನ್ನು ಮುಂದುವರಿಸಿ ಮುಂದಿನ ವಾರದ ಮುನ್ಸೂಚನೆಯನ್ನು ಗಮನಿಸಿ.",
            "pa": "ਮੌਸਮ ਦੇ ਹਾਲਾਤ ਆਮ ਹਨ। ਨਦੀਨਾਂ ਦੀ ਰੋਕਥਾਮ ਅਤੇ ਆਮ ਖੇਤੀ ਕੰਮ ਜਾਰੀ ਰੱਖੋ ਅਤੇ ਅਗਲੇ ਹਫ਼ਤੇ ਦੀ ਮੌਸਮ ਜਾਣਕਾਰੀ ਤੇ ਨਜ਼ਰ ਰੱਖੋ।",
            "or": "ପାଣିପାଗ ସ୍ଥିତି ସ୍ୱାଭାବିକ ରହିଛି। ନିୟମିତ ଘାସ ବଛା ଓ କୃଷି କାର୍ଯ୍ୟ ଜାରି ରଖନ୍ତୁ ଏବଂ ପରବର୍ତ୍ତୀ ସପ୍ତାହର ପୂର୍ବାନୁମାନ ଦେଖନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-NRRI-PAD-DRAIN-01",
        "action_type": "drainage_alert",
        "crop_category": "paddy",
        "trigger_condition": "heavy_spell_probability >= 40",
        "english_title": "Paddy Waterlogging & Submergence Alert",
        "english_recommendation": "Heavy rainfall anticipated. Maintain standing water level in paddy fields below 5 cm for young transplanted seedlings. Clear bund drainage notches to avoid submerged seedling rot.",
        "suggested_measures": [
            "Regulate bund spillways to prevent submergence of newly transplanted seedlings.",
            "Withhold nitrogen top-dressing until high-intensity rainfall subsides."
        ],
        "icar_reference_code": "ICAR-NRRI-CRIDA-01",
        "localized_templates": {
            "hi": "धान के खेतों में जलस्तर 5 सेमी से नीचे बनाए रखने के लिए मेड़ों के निकास खोलें ताकि रोपाई किए गए नए पौधे डूबकर खराब न हों।",
            "mr": "भाताच्या खाचरात नव्याने लावणी केलेल्या रोपांना धोका टाळण्यासाठी शेतातील पाण्याची पातळी ५ सेंमी पेक्षा कमी ठेवा व जास्तीचे पाणी काढून द्या.",
            "te": "వరి పొలాల్లో నీటి మట్టాన్ని 5 సెం.మీ కంటే తక్కువగా ఉంచండి, మురుగు నీటిని బయటకు పంపండి.",
            "ta": "நெல் பயிரில் அதிக நீர் தேங்குவதைத் தவிர்க்க வரப்புகளில் வடிகால் வசதி செய்து அதிகப்படியான நீரை வெளியேற்றவும்.",
            "bn": "ধানের জমিতে জলস্তর ৫ সেমি-এর নিচে রাখতে অতিরিক্ত জল নিকাশের ব্যবস্থা করুন যাতে কচি চারা পচে না যায়।",
            "gu": "ડાંગરના ખેતરમાં પાણીની સપાટી 5 સેમીથી નીચે રાખવા વધારાના પાણીનો નિકાલ કરો.",
            "kn": "ಭತ್ತದ ಗದ್ದೆಯಲ್ಲಿ ನೀರು 5 ಸೆಂ.ಮೀ ಗಿಂತ ಹೆಚ್ಚು ನಿಲ್ಲದಂತೆ ಹೆಚ್ಚುವರಿ ನೀರನ್ನು ಹೊರಹಾಕಿ.",
            "pa": "ਝੋਨੇ ਦੇ ਖੇਤ ਵਿੱਚ ਪਾਣੀ ਦਾ ਪੱਧਰ 5 ਸੈਂਟੀਮੀਟਰ ਤੋਂ ਘੱਟ ਰੱਖਣ ਲਈ ਵਾਧੂ ਪਾਣੀ ਬਾਹਰ ਕੱਢੋ।",
            "or": "ଧାନ ଜମିରେ ୫ ସେମିରୁ ଅଧିକ ପାଣି ଜମିବାକୁ ନଦେଇ ନିଷ୍କାସନ ବ୍ୟବସ୍ଥା କରନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-IISR-SOY-DRAIN-01",
        "action_type": "drainage_alert",
        "crop_category": "soybean",
        "trigger_condition": "heavy_spell_probability >= 40",
        "english_title": "Soybean Waterlogging Prevention Alert",
        "english_recommendation": "Soybean is highly susceptible to root asphyxiation under waterlogged conditions. Clear inter-row furrows immediately to ensure no standing water remains longer than 24 hours.",
        "suggested_measures": [
            "Open drainage furrows every 4-6 rows to evacuate excess runoff.",
            "Check seedlings for collar rot symptoms after storm passes."
        ],
        "icar_reference_code": "ICAR-IISR-SOY-01",
        "localized_templates": {
            "hi": "सोयाबीन जलभराव के प्रति अत्यंत संवेदनशील है। खेतों से 24 घंटे के भीतर पानी की निकासी सुनिश्चित करें।",
            "mr": "सोयाबीन पिकात पाणी साचल्यास मुळे सडतात, त्यामुळे शेतातून चर काढून २४ तासांच्या आत पाण्याचा निचरा करा.",
            "te": "సోయాబీన్ పొలంలో నీరు నిల్వ ఉండకుండా వెంటనే కాలువలు తీసి నీటిని బయటకు పంపండి.",
            "ta": "சோயாபீன் பயிரில் நீர் தேங்குவதைத் தடுக்க உடனடியாக வடிகால் அமைக்கவும்.",
            "bn": "সয়াবিন জমিতে জল জমতে দেবেন না, দ্রুত জল নিকাশের ব্যবস্থা নিন।",
            "gu": "સોયાબીનમાં પાણી ભરાઈ ન રહે તે માટે તાકીદે નિકાલની વ્યવસ્થા કરો.",
            "kn": "ಸೋಯಾಬೀನ್ ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಬಸಿಗಾಲುವೆಗಳನ್ನು ತೆರೆಯಿರಿ.",
            "pa": "ਸੋਇਆਬੀਨ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਵਾਧੂ ਪਾਣੀ ਤੁਰੰਤ ਬਾਹਰ ਕੱਢੋ।",
            "or": "ସୋୟାବିନ୍ ଜମିରେ ପାଣି ଜମିବାକୁ ନଦେଇ ନିଷ୍କାସନ ନାଳି କାଟନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-CICR-COT-DRAIN-01",
        "action_type": "drainage_alert",
        "crop_category": "cotton",
        "trigger_condition": "heavy_spell_probability >= 40",
        "english_title": "Cotton Waterlogging Alert",
        "english_recommendation": "Heavy rain alert. Drain standing water from cotton furrows within 24 hours to prevent root suffocation, parawilt, and square dropping.",
        "suggested_measures": [
            "Open ridge furrows to facilitate gravity drainage in deep black soils."
        ],
        "icar_reference_code": "ICAR-CICR-COT-01",
        "localized_templates": {
            "hi": "कपास के खेतों में पानी जमा न होने दें। 24 घंटे में जल निकासी करें ताकि पौधे पीले न पड़ें।",
            "mr": "कापूस पिकात पाणी साचल्यास उभे झाड सुकण्याची (पॅराव्हिल्ट) शक्यता असते, तातडीने पाणी बाहेर काढा.",
            "te": "పత్తి చేనులో నీరు నిల్వ ఉండకుండా వెంటనే బయటకు పంపండి.",
            "ta": "பருத்தி வயலில் தண்ணீர் தேங்குவதைத் தடுத்து உடனே வடிகால் அமைக்கவும்.",
            "bn": "তুলা ক্ষেতে জল জমতে না দিয়ে দ্রুত বের করে দিন।",
            "gu": "કપાસમાં પાણી ભરાઈ ન રહે તે માટે તાકીદે નીતાર કરો.",
            "kn": "ಹತ್ತಿ ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಬಸಿಗಾಲುವೆ ಮಾಡಿ.",
            "pa": "ਨਰਮੇ/ਕਪਾਹ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਪਾਣੀ ਤੁਰੰਤ ਕੱਢੋ।",
            "or": "କପା ଜମିରୁ ଅତିରିକ୍ତ ପାଣି ତୁରନ୍ତ ବାହାର କରନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-IIMR-MAI-DRAIN-01",
        "action_type": "drainage_alert",
        "crop_category": "maize",
        "trigger_condition": "heavy_spell_probability >= 40",
        "english_title": "Maize Excess Moisture Alert",
        "english_recommendation": "Maize is highly sensitive to waterlogging at the knee-high stage. Create furrow drains to discharge runoff rapidly.",
        "suggested_measures": [
            "Keep furrows open between rows to evacuate stormwater."
        ],
        "icar_reference_code": "ICAR-IIMR-MAI-01",
        "localized_templates": {
            "hi": "मक्के की फसल में घुटने तक की अवस्था में जलभराव से भारी नुकसान होता है। तुरंत पानी निकालें।",
            "mr": "मका पीक गुडघाभर उंचीच्या अवस्थेत असताना पाणी साचल्यास मोठे नुकसान होते, पाण्याचा त्वरित निचरा करा.",
            "te": "మొక్కజొన్న పొలంలో నీరు నిల్వ ఉండకుండా జాగ్రత్తపడండి.",
            "ta": "மக்காச்சோள வயலில் தேங்கிய நீரை உடனே வெளியேற்றவும்.",
            "bn": "ভুট্টা ক্ষেতে জল জমতে না দিয়ে অবিলম্বে নিকাশের ব্যবস্থা করুন।",
            "gu": "મકાઈના પાકમાં પાણી ભરાઈ ન રહે તે જોવું.",
            "kn": "ಮೆಕ್ಕೆಜೋಳದ ಗದ್ದೆಯಿಂದ ಹೆಚ್ಚುವರಿ ನೀರನ್ನು ಹೊರಹಾಕಿ.",
            "pa": "ਮੱਕੀ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਪਾਣੀ ਦੀ ਨਿਕਾਸੀ ਯਕੀਨੀ ਬਣਾਓ।",
            "or": "ମକା ଜମିରୁ ତୁରନ୍ତ ପାଣି ନିଷ୍କାସନ କରନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-IIPR-PUL-DRAIN-01",
        "action_type": "drainage_alert",
        "crop_category": "pulses",
        "trigger_condition": "heavy_spell_probability >= 40",
        "english_title": "Kharif Pulses Phytophthora & Waterlogging Alert",
        "english_recommendation": "Pigeonpea (Arhar) and Greengram (Moong) are vulnerable to Phytophthora blight under waterlogging. Drain excess water without delay.",
        "suggested_measures": [
            "Ensure free drainage in all pulse fields to save root nodules."
        ],
        "icar_reference_code": "ICAR-IIPR-PUL-01",
        "localized_templates": {
            "hi": "अरहर एवं मूंग में जलभराव से उकठा एवं झुलसा रोग फैलता है। खेत से पानी तत्काल निकालें।",
            "mr": "तूर व मूग पिकात पाणी साचल्यास मूळकूज व फायटोप्थोरा रोगाचा प्रादुर्भाव होतो, त्वरित पाण्याचा निचरा करा.",
            "te": "కంది, పెసర పొలాల్లో నీరు నిల్వ ఉండకుండా మురుగు నీటిని తీసివేయండి.",
            "ta": "துவரை, பாசிப்பயறு பயிர்களில் நீர் தேங்காமல் உடனடியாக வடிக்கவும்.",
            "bn": "ডালজাতীয় ফসলের জমিতে জল জমতে দেবেন না, দ্রুত জল বের করে দিন।",
            "gu": "કઠોળ પાકોમાં પાણી ભરાઈ ન રહે તે માટે નિકાલ કરો.",
            "kn": "ತೊಗರಿ ಮತ್ತು ಹೆಸರು ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಹೊರಹಾಕಿ.",
            "pa": "ਦਾਲਾਂ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਵਾਧੂ ਪਾਣੀ ਤੁਰੰਤ ਕੱਢੋ।",
            "or": "ଡାଲି ଜାତୀୟ ଫସଲରୁ ତୁରନ୍ତ ପାଣି ନିଷ୍କାସନ କରନ୍ତୁ।"
        },
        "is_active": True
    },
    {
        "rule_code": "ICAR-DGR-GND-DRAIN-01",
        "action_type": "drainage_alert",
        "crop_category": "groundnut",
        "trigger_condition": "heavy_spell_probability >= 40",
        "english_title": "Groundnut Collar Rot & Drainage Alert",
        "english_recommendation": "Excess moisture triggers collar rot and peg decay in groundnut. Open drainage furrows immediately.",
        "suggested_measures": [
            "Clear ridge furrows to keep root zone aerated."
        ],
        "icar_reference_code": "ICAR-DGR-GND-01",
        "localized_templates": {
            "hi": "मूंगफली में अधिक नमी से कॉलर रॉट (तना सड़न) रोग का खतरा बढ़ता है। पानी निकासी सुनिश्चित करें।",
            "mr": "भुईमूग पिकात पाणी साचून राहिल्यास खोडकुजव्या रोगाचा धोका वाढतो, चर काढून पाणी बाहेर काढा.",
            "te": "వేరుశనగ పొలంలో నీరు నిల్వ ఉండకుండా జాగ్రత్తపడండి.",
            "ta": "நிலக்கடலை வயலில் தேங்கிய நீரை உடனே வெளியேற்றவும்.",
            "bn": "ચિનাবাদাম জমিতে অতিরিক্ত জল জমে থাকা রোধে নিকাশি ব্যবস্থা করুন।",
            "gu": "મગફળીમાં પાણી ભરાઈ રહેવાથી થડના સડાનો ભય રહે છે, નિકાલ કરો.",
            "kn": "ಕಡಲೆಕಾಯಿ ಬೆಳೆಯಲ್ಲಿ ನೀರು ನಿಲ್ಲದಂತೆ ತಕ್ಷಣ ಬಸಿಗಾಲುವೆ ಮಾಡಿ.",
            "pa": "ਮੂੰਗਫਲੀ ਦੇ ਖੇਤ ਵਿੱਚੋਂ ਵਾਧੂ ਪਾਣੀ ਬਾਹਰ ਕੱਢੋ।",
            "or": "ଚିନାବାଦାମ ଜମିରୁ ତୁରନ୍ତ ପାଣି ନିଷ୍କାସନ କରନ୍ତୁ।"
        },
        "is_active": True
    }
]


def seed_advisory_rules(dry_run: bool = False) -> int:
    """Idempotently upsert seeded advisory rules into Supabase public.advisory_rules."""
    cfg = get_pipeline_config()
    if not cfg.supabase_url or not cfg.supabase_service_role_key:
        logger.warning("Supabase credentials not configured; skipping remote seed.")
        return len(SEEDED_ADVISORY_RULES)

    if dry_run:
        logger.info(f"[DRY-RUN] Would upsert {len(SEEDED_ADVISORY_RULES)} rules into public.advisory_rules")
        return len(SEEDED_ADVISORY_RULES)

    url = f"{cfg.supabase_url.rstrip('/')}/rest/v1/advisory_rules"
    headers = {
        "apikey": cfg.supabase_service_role_key,
        "Authorization": f"Bearer {cfg.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    try:
        response = requests.post(
            url,
            headers=headers,
            data=json.dumps(SEEDED_ADVISORY_RULES, ensure_ascii=False).encode("utf-8"),
            timeout=20,
        )
        if response.status_code in (200, 201, 204):
            logger.info(f"Successfully seeded {len(SEEDED_ADVISORY_RULES)} rules into public.advisory_rules (HTTP {response.status_code})")
            return len(SEEDED_ADVISORY_RULES)
        else:
            logger.error(f"Failed to seed advisory_rules: HTTP {response.status_code}: {response.text}")
            return 0
    except Exception as exc:
        logger.error(f"Exception during advisory_rules seed: {exc}")
        return 0


if __name__ == "__main__":
    count = seed_advisory_rules(dry_run=False)
    print(f"Seeded {count} advisory rules.")
