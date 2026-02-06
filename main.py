import streamlit as st
import pandas as pd
import sqlite3
from datetime import datetime, timedelta

# Database ချိတ်ဆက်မှု
conn = sqlite3.connect('unity.db', check_same_thread=False)
c = conn.cursor()

def init_db():
    c.execute('CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, name TEXT, phone TEXT)')
    c.execute('CREATE TABLE IF NOT EXISTS tx (id INTEGER PRIMARY KEY, date TEXT, m_id INTEGER, cat TEXT, type TEXT, amt REAL, note TEXT)')
    c.execute('CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY, m_id INTEGER, amt REAL, rate REAL, date TEXT, status TEXT)')
    conn.commit()

init_db()

st.set_page_config(page_title="Social Unity App", layout="wide")
st.title("🤝 လူမှုရေးအသင်းအဖွဲ့ စီမံခန့်ခွဲမှုစနစ်")

menu = ["Dashboard", "အသင်းဝင်များ", "စာရင်းသွင်း (Income/Exp)", "ချေးငွေကဏ္ဍ", "အစီရင်ခံစာ (Reports)"]
choice = st.sidebar.radio("Menu", menu)

# --- Member Management ---
if choice == "အသင်းဝင်များ":
    name = st.text_input("အမည်")
    phone = st.text_input("ဖုန်း")
    if st.button("အသင်းဝင်အသစ်သွင်းမည်"):
        c.execute("INSERT INTO members (name, phone) VALUES (?,?)", (name, phone))
        conn.commit()
        st.success("အောင်မြင်သည်")

    st.subheader("အသင်းသားစာရင်း")
    df = pd.read_sql_query("SELECT * FROM members", conn)
    st.dataframe(df, use_container_width=True)

# --- Transactions ---
elif choice == "စာရင်းသွင်း (Income/Exp)":
    m_df = pd.read_sql_query("SELECT * FROM members", conn)
    m_list = {row['name']: row['id'] for i, row in m_df.iterrows()}

    selected_m = st.selectbox("အသင်းသားရွေးပါ", list(m_list.keys()))
    t_cat = st.selectbox("ခေါင်းစဉ်", ["လစဉ်ကြေး", "အလှူငွေ", "ကျန်းမာရေး", "ပညာရေး", "နာရေး", "အထွေထွေအသုံးစရိတ်"])
    t_type = "Income" if t_cat in ["လစဉ်ကြေး", "အလှူငွေ"] else "Expense"
    t_amt = st.number_input("ပမာဏ", min_value=0.0)
    t_date = st.date_input("ရက်စွဲ")

    if st.button("စာရင်းသွင်းမည်"):
        c.execute("INSERT INTO tx (date, m_id, cat, type, amt) VALUES (?,?,?,?,?)",
                  (str(t_date), m_list[selected_m], t_cat, t_type, t_amt))
        conn.commit()
        st.success(f"{t_type} စာရင်းသွင်းပြီးပါပြီ")

# --- Reports (၁ လ၊ ၃ လ၊ ၆ လ၊ ၁ နှစ်) ---
elif choice == "အစီရင်ခံစာ (Reports)":
    st.subheader("ကာလအလိုက် စာရင်းချုပ်")
    period = st.selectbox("ကာလရွေးပါ", [1, 3, 4, 6, 12])
    start_date = (datetime.now() - timedelta(days=period*30)).strftime('%Y-%m-%d')

    df = pd.read_sql_query(f"SELECT * FROM tx WHERE date >= '{start_date}'", conn)

    inc = df[df['type']=='Income']['amt'].sum()
    exp = df[df['type']=='Expense']['amt'].sum()

    col1, col2, col3 = st.columns(3)
    col1.metric("စုစုပေါင်းရငွေ", f"{inc:,.0f}")
    col2.metric("စုစုပေါင်းအသုံးစရိတ်", f"{exp:,.0f}")
    col3.metric("လက်ကျန်ငွေ", f"{inc-exp:,.0f}")
    st.dataframe(df)