# Test Visit Recordings

This folder contains realistic doctor-patient conversation scripts for testing the visit recording and clinical note generation features.

## Available Test Cases

### Patient 1: Ali Assad - Migraine Headaches (First Visit)
**File:** `patient1_meeting.txt`
**Duration:** ~20 minutes
**Chief Complaint:** Severe headaches with visual aura
**Key Details:**
- First visit to clinic (NEW PATIENT)
- Complete medical history collection
- Blood type: O+
- Past surgeries: Appendectomy
- Chronic conditions: Type 2 diabetes, hypertension
- Current medications: Metformin, Lisinopril
- Allergies: Penicillin
- Family history: Diabetes, heart disease
- Social history: Former smoker (quit 2 years ago), accountant
- Diagnosis: Migraine with aura
- Treatment: Sumatriptan, Propranolol, Ondansetron
- Orders: Brain MRI, blood work (CMP, HbA1C)

**What This Tests:**
- First visit detection
- Comprehensive patient history extraction
- Blood type documentation
- Past medical history
- Family history
- Social history
- Medication prescriptions with specific dosing
- Imaging orders
- Laboratory orders
- Patient summary generation

---

### Patient 2: Maya Hassan - Anxiety and Panic Attacks (First Visit)
**File:** `patient2_meeting.txt`
**Duration:** ~18 minutes
**Chief Complaint:** Severe anxiety and panic attacks
**Key Details:**
- First visit to clinic (NEW PATIENT)
- Blood type: A-
- Past surgeries: Tonsillectomy, wisdom teeth removal
- Current medications: Birth control pills, Vitamin D
- Allergies: Sulfa drugs, shellfish
- Family history: Breast cancer, hypothyroidism, high cholesterol, lupus, stroke
- Social history: Non-smoker, graphic designer working from home
- Recent stressors: Breakup, financial concerns, moving
- Diagnosis: Panic disorder with generalized anxiety disorder
- Treatment: Sertraline (SSRI), Alprazolam (PRN)
- Referral: CBT therapy
- Orders: CBC, CMP, thyroid function tests (TSH, free T4)

**What This Tests:**
- Mental health documentation
- Multiple allergies
- Family history of complex conditions
- Lifestyle and occupation documentation
- Pharmacological and non-pharmacological treatment
- Referral documentation
- Safety assessment (suicide screening)
- Patient education

---

### Patient 3: Omar Khalil - Chronic Cough with Concerning Symptoms (First Visit)
**File:** `patient3_meeting.txt`
**Duration:** ~22 minutes
**Chief Complaint:** Persistent cough with hemoptysis, shortness of breath
**Key Details:**
- First visit to clinic (NEW PATIENT)
- Blood type: B+
- Past surgeries: Hernia repair, colonoscopy with polyp removal
- Past hospitalizations: Kidney stones
- Chronic conditions: High cholesterol, GERD, BPH, mild osteoarthritis, sleep apnea
- Current medications: Atorvastatin, Omeprazole, Tamsulosin, Baby aspirin
- Uses CPAP (non-compliant)
- Allergies: Codeine
- Family history: Heart disease (father died of MI), dementia, diabetes, prostate cancer, rheumatoid arthritis
- Social history: Former smoker (quit 15 years ago), heavy alcohol use, civil engineer
- Red flag symptoms: Hemoptysis, weight loss, night sweats, fever
- Diagnosis: Likely lung pathology (infection vs. COPD vs. malignancy)
- Treatment: Azithromycin, dextromethorphan cough suppressant, albuterol inhaler
- Orders: Chest X-ray (stat), CT chest, sputum culture, CBC, CMP, inflammatory markers
- Referral: Pulmonologist for possible bronchoscopy
- TB precautions discussed

**What This Tests:**
- Complex medical history with multiple chronic conditions
- Medication reconciliation with multiple drugs
- Red flag symptom documentation
- Urgent diagnostic workup
- Multiple order types (imaging, labs, cultures)
- Specialist referral
- Safety precautions (TB isolation)
- Substance use counseling (alcohol)
- CPAP compliance discussion

---

### Patient 4: Layla Nasser - Heavy Menstrual Bleeding and Anemia (First Visit)
**File:** `patient4_meeting.txt`
**Duration:** ~20 minutes
**Chief Complaint:** Heavy menstrual bleeding, fatigue
**Key Details:**
- First visit to clinic (NEW PATIENT)
- Blood type: AB+
- Past surgeries: Two C-sections (2015, 2017), cholecystectomy (2019)
- Chronic conditions: Hypothyroidism, IBS, PCOS
- Current medications: Levothyroxine, prenatal vitamins
- Birth control: Mirena IUD (inserted 3 years ago)
- Allergies: Latex, tree nuts (carries EpiPen)
- Family history: Type 2 diabetes, hypertension, stroke, coronary artery disease, PCOS, breast cancer
- Social history: Non-smoker, rare alcohol use, high school English teacher
- Classic anemia symptoms: Fatigue, weakness, dizziness, pica (ice craving), pallor, tachycardia
- Physical exam findings: Pale conjunctiva and nail beds, enlarged uterus, pelvic tenderness
- Diagnosis: Iron deficiency anemia secondary to menorrhagia, likely fibroids
- Treatment: Ferrous sulfate TID, tranexamic acid TID during menses, ibuprofen 600mg TID
- Orders: CBC, CMP, iron studies (ferritin), TSH, pelvic ultrasound (abdominal and transvaginal)
- Possible referral: Gynecology for further evaluation

**What This Tests:**
- Obstetric history (gravida/para)
- Multiple allergies including severe allergy with EpiPen
- Complex gynecological issues
- Detailed physical exam findings
- Iron supplementation education
- Medication timing instructions (with/without food, calcium interactions)
- Warning signs education (when to go to ER)
- Fertility considerations
- Work-life balance counseling

---

## How to Use These Test Scripts

### Option 1: Text-to-Speech Conversion (Recommended for Testing)

1. Use a text-to-speech service to convert these scripts to audio files:
   - Use different voices for doctor vs. patient
   - Natural speech pace with pauses
   - Recommended tools:
     - Google Cloud Text-to-Speech
     - Amazon Polly
     - ElevenLabs (high quality)
     - Natural Reader

2. Save as MP3 or WAV files

3. Use the **Upload File** feature in the Visit Recorder to test

### Option 2: Manual Reading and Recording

1. Have two people read the script (one as doctor, one as patient)
2. Record using the live recording feature or any audio recording software
3. Upload the recorded file for testing

### Option 3: Direct Transcription Testing

For quick testing without audio:
1. Copy the text content
2. Manually format it for the transcription service
3. Use it to test the clinical note generation directly

---

## What Each Test Case Validates

### First Visit Detection ✓
All patients are new to the clinic, so the system should:
- Detect `isFirstVisit = true`
- Extract comprehensive medical history
- Populate blood type, past surgeries, family history, social history
- Create complete patient profile from scratch

### Clinical Note Generation ✓
- SOAP note format (Subjective, Objective, Assessment, Plan)
- History of Present Illness (HPI)
- Review of Systems (ROS)
- Physical exam findings
- Clinical assessment
- Treatment plan

### Order Extraction ✓
- Lab orders (CBC, CMP, metabolic panels, cultures)
- Imaging orders (X-ray, CT, MRI, ultrasound)
- Prescriptions with dosing (medication name, dosage, frequency, duration, route)
- Follow-up appointments

### Patient Profile Updates ✓
- Blood type
- Allergies (medications and other)
- Current medications
- Chronic conditions
- Past surgeries and hospitalizations
- Family history
- Social history (smoking, alcohol, occupation)
- Active problems list

### Patient Summary ✓
- Layperson-friendly language
- What was found during visit
- What medications were prescribed
- What tests are needed
- What to watch for (warning signs)
- When to follow up

### Safety Flags ✓
- Drug interactions
- Allergy considerations
- Red flag symptoms
- Urgent/emergent conditions
- Precautions needed

---

## Expected AI Extraction Examples

### From Patient 1 (Ali Assad):
```json
{
  "patientFileUpdates": {
    "bloodType": "O+",
    "newMedications": ["Metformin 500mg twice daily", "Lisinopril 10mg daily"],
    "newAllergies": ["Penicillin"],
    "newChronicConditions": ["Type 2 diabetes", "Hypertension"],
    "pastSurgeries": ["Appendectomy (2004)", "Hospitalization for pneumonia (5 years ago)"],
    "familyHistory": "Father with type 2 diabetes and two heart attacks. Mother with high cholesterol and arthritis. Brother with diabetes.",
    "socialHistory": {
      "smoking": "Former smoker, quit 2 years ago after 10 years of pack-a-day smoking",
      "alcohol": "Social drinker, 1-2 beers on weekends",
      "exercise": "Walks 30 minutes 3-4 times per week",
      "occupation": "Accountant, sedentary desk job"
    }
  },
  "orders": [
    {
      "type": "PRESCRIPTION",
      "description": "Sumatriptan 50mg for acute migraine",
      "medication": {
        "name": "Sumatriptan",
        "dosage": "50mg",
        "frequency": "At first sign of migraine",
        "duration": "As needed",
        "route": "Oral"
      }
    },
    {
      "type": "IMAGING_ORDER",
      "description": "MRI brain to rule out structural causes"
    },
    {
      "type": "LAB_ORDER",
      "description": "Comprehensive metabolic panel and HbA1C"
    }
  ]
}
```

---

## Testing Checklist

- [ ] Upload audio file through new upload interface
- [ ] Verify AssemblyAI transcription completes
- [ ] Check first visit detection works correctly
- [ ] Verify clinical note appears in approval queue
- [ ] Verify patient profile update appears separately in approval queue
- [ ] Check side-by-side comparison shows current vs. proposed changes
- [ ] Approve both items and verify they populate correctly
- [ ] Check visit moves to "Done Meetings"
- [ ] Verify patient can see their visit summary
- [ ] Verify all extracted data is accurate and complete

---

## Notes

- These scripts are realistic but fictional
- All patient names are fictional
- Medical scenarios are educationally accurate
- Each script is approximately 15-25 minutes of conversation
- Scripts include natural conversation flow with repeated information and clarifications
- All include the comprehensive first-visit history intake required for new patients
